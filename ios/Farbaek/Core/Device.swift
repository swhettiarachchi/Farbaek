import AuthenticationServices
import LocalAuthentication
import UIKit

enum SignInError: LocalizedError {
    case cancelled
    case couldNotStart
    case refused(String)
    case mismatched

    var errorDescription: String? {
        switch self {
        case .cancelled: return nil
        case .couldNotStart: return "The sign-in sheet couldn't open. Try again."
        case .refused(let reason): return reason
        case .mismatched: return "That sign-in answer wasn't for this request. Tap Sign in again."
        }
    }
}

/// Signs in on www.farbaek.com in the system's browser sheet (ADR 0110). The
/// sheet shares Safari's sign-in, so someone already signed in there only
/// agrees to connect the phone. The phone sends a PKCE challenge and keeps
/// the verifier; the answer comes back to farbaek://connected.
final class WebSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    struct Request {
        let url: URL
        let verifier: String
        let state: String
    }

    static func request(device: String) -> Request {
        let verifier = PKCE.random()
        let state = PKCE.random(bytes: 16)
        var components = URLComponents(url: AppConfig.site("auth/connect"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "challenge", value: PKCE.challenge(for: verifier)),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "platform", value: "ios"),
            URLQueryItem(name: "device", value: device),
        ]
        return Request(url: components.url!, verifier: verifier, state: state)
    }

    /// Opens the sheet and returns the code Farbaek answered with.
    @MainActor
    func code(for request: Request) async throws -> String {
        let callback: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: request.url, callbackURLScheme: "farbaek") { url, error in
                if let url {
                    continuation.resume(returning: url)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: SignInError.cancelled)
                } else {
                    continuation.resume(throwing: SignInError.refused(error?.localizedDescription ?? "The sign-in didn't finish. Try again."))
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                continuation.resume(throwing: SignInError.couldNotStart)
            }
        }
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value: (String) -> String? = { name in items.first(where: { $0.name == name })?.value }
        guard value("state") == request.state else { throw SignInError.mismatched }
        if let error = value("error") {
            switch error {
            case "cancelled": throw SignInError.cancelled
            case "too_many": throw SignInError.refused("Several sign-ins are already waiting. Wait two minutes, then try again.")
            default: throw SignInError.refused("The sign-in request wasn't complete. Try again.")
            }
        }
        guard let code = value("code") else { throw SignInError.refused("Farbaek didn't send a sign-in code. Try again.") }
        return code
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            return scene?.keyWindow ?? ASPresentationAnchor()
        }
    }
}

/// Face ID, Touch ID or the passcode before a consequential step. The server
/// checks everything again; this keeps someone else holding the unlocked
/// phone from approving for you.
enum OwnerCheck {
    static func confirm(_ reason: String) async -> Bool {
        let context = LAContext()
        var error: NSError?
        // A phone with no passcode can't ask; the button press is the confirmation.
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return true }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }
}
