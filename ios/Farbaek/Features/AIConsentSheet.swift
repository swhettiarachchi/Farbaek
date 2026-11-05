import SwiftUI

/// Whether the person signed in here has allowed what they write to go to an AI service (ADR 0173, guideline 5.1.2(i)).
/// Signing out clears it, so the next person on this iPhone is asked.
enum AIConsent {
    private static let key = "ai-consent-v1"

    static var given: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}

/// Asked before anything is first sent, in plain words, with what goes where.
struct AIConsentSheet: View {
    let onAllow: () -> Void
    let onDecline: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Allow AI to work on this?")
                    .font(.title2.weight(.medium))
                    .tracking(-0.4)
                    .foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                Self.line("paperplane", "What you write and your project's files are sent to Anthropic (Claude) or Google (Gemini), the AI services Farbaek uses to plan and build.")
                Self.line("checkmark.seal", "You still approve every plan and every change before anything goes into your project.")
                Self.line("gearshape", "You can change this any time in You.")
                Link(destination: AppConfig.privacyURL) {
                    Label("Read the Privacy Policy", systemImage: "hand.raised")
                        .frame(minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .font(.subheadline.weight(.medium))
            }
            .padding(20)
        }
        .background(Palette.canvas.ignoresSafeArea())
        // Both answers stay in view, equally easy to reach, however small the phone or large the text.
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 10) {
                Button("Allow") { onAllow() }
                    .buttonStyle(PillButtonStyle(kind: .accent))
                Button("Not now") { onDecline() }
                    .buttonStyle(PillButtonStyle(kind: .secondary))
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .background(.bar)
        }
        .presentationDetents([.large])
    }

    private static func line(_ symbol: String, _ text: String) -> some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol).foregroundStyle(Palette.accent)
        }
        .font(.subheadline)
        .foregroundStyle(Palette.ink2)
    }
}

extension View {
    /// Shows the question. Swiping it away decides nothing, and nothing is sent.
    func aiConsent(isPresented: Binding<Bool>, onAllow: @escaping () -> Void, onDecline: @escaping () -> Void) -> some View {
        sheet(isPresented: isPresented) {
            AIConsentSheet(onAllow: onAllow, onDecline: onDecline)
        }
    }
}
