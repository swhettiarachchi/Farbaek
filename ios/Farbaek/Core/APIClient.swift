import Foundation

/// An answer Farbaek refused, in its own words.
struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String
    let message: String

    var errorDescription: String? { message }

    static let offline = APIError(status: 0, code: "OFFLINE", message: "Farbaek can't be reached. Check your connection and try again.")
    static let signedOut = APIError(status: 401, code: "SIGNED_OUT", message: "You're signed out. Sign in again to continue.")
    static let unreadable = APIError(status: 0, code: "UNREADABLE", message: "Farbaek answered in a way this version of the app doesn't understand. Update the app and try again.")
}

/// Talks to /api/v1/app as this phone (ADR 0110). Keeps the session fresh: it
/// refreshes shortly before the access token expires, retries once when
/// Farbaek asks for a fresher one, and signs out locally when Farbaek says
/// the phone was disconnected.
@MainActor
final class APIClient {
    let base: URL
    /// The sample workspace: no account, every read from /api/v1/app/sample.
    var sample = false
    var workspaceId: String?
    var onSignedOut: (() -> Void)?

    private(set) var tokens: Tokens?
    private var refreshing: Task<Tokens, Error>?
    private let session: URLSession

    init(base: URL) {
        self.base = base
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.waitsForConnectivity = false
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        session = URLSession(configuration: config)
        tokens = Keychain.load()
    }

    var hasSession: Bool { tokens != nil }

    func adopt(_ grant: TokenGrant) {
        let next = Tokens(accessToken: grant.accessToken, refreshToken: grant.refreshToken, expiresAt: grant.expiresAt)
        tokens = next
        Keychain.save(next)
    }

    func forget() {
        tokens = nil
        Keychain.delete()
    }

    // MARK: Requests

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as type: T.Type = T.self) async throws -> T {
        try await call("GET", path, query: query, body: nil, as: type)
    }

    func send<T: Decodable>(_ method: String, _ path: String, body: [String: Any]? = nil, as type: T.Type = T.self) async throws -> T {
        try await call(method, path, query: [], body: body, as: type)
    }

    private func call<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem], body: [String: Any]?, as type: T.Type) async throws -> T {
        var retried = false
        while true {
            var token: String?
            if !sample { token = try await freshAccessToken() }
            let (data, status) = try await perform(method, (sample ? "sample/" : "") + path, query: query, body: body, token: token)
            if (200..<300).contains(status) {
                do {
                    return try JSONDecoder().decode(Envelope<T>.self, from: data).data
                } catch {
                    throw APIError.unreadable
                }
            }
            let failure = Self.error(from: data, status: status)
            if !sample, !retried, failure.code == "TOKEN_EXPIRED" || failure.code == "REFRESH_FIRST" {
                retried = true
                _ = try await refresh()
                continue
            }
            if !sample, failure.code == "DISCONNECTED" || failure.code == "SIGNED_OUT" || failure.code == "UNAUTHENTICATED" {
                forget()
                onSignedOut?()
            }
            throw failure
        }
    }

    private func perform(_ method: String, _ path: String, query: [URLQueryItem], body: [String: Any]?, token: String?) async throws -> (Data, Int) {
        var components = URLComponents(url: base.appendingPathComponent("api/v1/app/" + path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let workspaceId, !sample { request.setValue(workspaceId, forHTTPHeaderField: "X-Farbaek-Workspace") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        do {
            let (data, response) = try await session.data(for: request)
            return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
        } catch {
            throw APIError.offline
        }
    }

    private static func error(from data: Data, status: Int) -> APIError {
        if let body = try? JSONDecoder().decode(ErrorEnvelope.self, from: data) {
            return APIError(status: status, code: body.error.code, message: body.error.message)
        }
        return APIError(status: status, code: "HTTP_\(status)", message: "Farbaek couldn't do that right now. Try again in a moment.")
    }

    // MARK: The session

    private func freshAccessToken() async throws -> String {
        guard let tokens else { throw APIError.signedOut }
        if tokens.expiresAt - Date().timeIntervalSince1970 > 120 { return tokens.accessToken }
        return try await refresh().accessToken
    }

    /// One refresh at a time; requests waiting on it share its answer.
    @discardableResult
    func refresh() async throws -> Tokens {
        if let refreshing { return try await refreshing.value }
        guard let current = tokens else { throw APIError.signedOut }
        let task = Task<Tokens, Error> { [weak self] in
            guard let self else { throw APIError.signedOut }
            let grant: TokenGrant = try await self.signInStep("refresh", body: ["refreshToken": current.refreshToken])
            return Tokens(accessToken: grant.accessToken, refreshToken: grant.refreshToken, expiresAt: grant.expiresAt)
        }
        refreshing = task
        defer { refreshing = nil }
        do {
            let next = try await task.value
            tokens = next
            Keychain.save(next)
            return next
        } catch let failure as APIError where failure.status == 401 {
            forget()
            onSignedOut?()
            throw failure
        }
    }

    /// The sign-in steps (token, refresh), which carry their own credential.
    func signInStep<T: Decodable>(_ step: String, body: [String: Any]) async throws -> T {
        let (data, status) = try await perform("POST", step, query: [], body: body, token: nil)
        guard (200..<300).contains(status) else { throw Self.error(from: data, status: status) }
        do {
            return try JSONDecoder().decode(Envelope<T>.self, from: data).data
        } catch {
            throw APIError.unreadable
        }
    }
}
