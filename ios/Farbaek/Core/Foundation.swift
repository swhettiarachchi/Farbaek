import CryptoKit
import Foundation
import Security
import StoreKit

/// Where the app talks to, and the links it opens. The site is set in Info.plist (FarbaekBaseURL).
enum AppConfig {
    static let baseURL: URL = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "FarbaekBaseURL") as? String, let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://www.farbaek.com")!
    }()

    /// "1.0.0+3": what Settings > Phones shows next to this phone.
    static var appVersion: String {
        let short = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(short)+\(build)"
    }

    static func site(_ path: String) -> URL {
        baseURL.appendingPathComponent(path)
    }

    static let privacyURL = URL(string: "https://www.farbaek.com/privacy")!
    static let termsURL = URL(string: "https://www.farbaek.com/terms")!
    static let deleteAccountURL = URL(string: "https://www.farbaek.com/app/settings#delete-account")!
    static let supportEmail = "support@farbaek.com"
}

/// The phone's session: Supabase tokens Farbaek issued to this phone alone (ADR 0110).
struct Tokens: Codable, Equatable {
    var accessToken: String
    var refreshToken: String
    /// Seconds since 1970.
    var expiresAt: Double
}

/// The session lives in the Keychain, on this device only, readable after the first unlock.
enum Keychain {
    private static let service = "com.farbaek.app.session"
    private static let account = "tokens"

    private static var base: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    static func load() -> Tokens? {
        var query = base
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Tokens.self, from: data)
    }

    static func save(_ tokens: Tokens) {
        guard let data = try? JSONEncoder().encode(tokens) else { return }
        let update: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        if SecItemUpdate(base as CFDictionary, update as CFDictionary) == errSecItemNotFound {
            var add = base
            for (key, value) in update { add[key] = value }
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    static func delete() {
        SecItemDelete(base as CFDictionary)
    }
}

/// RFC 7636: the verifier stays on the phone; only its S256 challenge goes to the browser.
enum PKCE {
    static func random(bytes count: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        precondition(status == errSecSuccess, "The phone couldn't make random bytes")
        return base64URL(Data(bytes))
    }

    static func challenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

/// Farbaek's times are ISO 8601, from Postgres (microseconds, +00:00) or JavaScript (milliseconds, Z).
enum FarbaekDate {
    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let whole: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static func parse(_ text: String) -> Date? {
        if let date = fractional.date(from: text) ?? whole.date(from: text) { return date }
        // Keep three digits of a longer fraction, which every formatter reads.
        guard let dot = text.firstIndex(of: ".") else { return nil }
        let fraction = text[text.index(after: dot)...]
        let digits = String(fraction.prefix { $0.isNumber })
        let rest = String(fraction.dropFirst(digits.count))
        let three = String(digits.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0)
        let trimmed: String = String(text[..<dot]) + "." + three + rest
        return fractional.date(from: trimmed)
    }
}

/// Buying a plan happens on www.farbaek.com (ADR 0110). Apple lets an app
/// link to buying on the web only in the United States App Store (guideline
/// 3.1.1(a), since May 2025). Everywhere else the app shows the plan with no
/// way to buy, as a free companion app must (guideline 3.1.3(f)).
enum WebPurchase {
    static let billingURL = URL(string: "https://www.farbaek.com/app/billing")!

    /// True only when this person's App Store is the United States one.
    static func allowed() async -> Bool {
        guard let storefront = await Storefront.current else { return false }
        return storefront.countryCode == "USA"
    }
}
