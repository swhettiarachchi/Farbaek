import AuthenticationServices
import CryptoKit
import Foundation

/// Sign in with Apple (ADR 0113). The app asks Apple for the person's email
/// only, with a fresh nonce whose SHA-256 Apple writes into the identity token.
/// Farbaek's server hands the token and the nonce to Supabase Auth, which
/// checks Apple's signature, that the token is for this app, and the hash.
enum AppleSignIn {
    /// One sign-in's nonce: the raw value goes to Farbaek, its hash to Apple.
    struct Attempt {
        let nonce: String
        var hashedNonce: String { AppleSignIn.sha256Hex(nonce) }
    }

    static func newAttempt() -> Attempt {
        Attempt(nonce: PKCE.random(bytes: 32))
    }

    static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static let userKey = "appleUser"

    /// Apple's id for the person, kept so a launch can tell when they stopped using their Apple ID with Farbaek.
    static var rememberedUser: String? {
        get { UserDefaults.standard.string(forKey: userKey) }
        set { UserDefaults.standard.set(newValue, forKey: userKey) }
    }

    /// True when the person removed Farbaek in Settings > Apple Account > Sign in with Apple.
    static func revoked() async -> Bool {
        guard let user = rememberedUser else { return false }
        return await withCheckedContinuation { continuation in
            ASAuthorizationAppleIDProvider().getCredentialState(forUserID: user) { state, _ in
                continuation.resume(returning: state == .revoked)
            }
        }
    }
}
