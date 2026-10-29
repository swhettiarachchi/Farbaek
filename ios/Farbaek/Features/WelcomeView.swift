import SwiftUI

/// The first screen: what the app is for, signing in through www.farbaek.com,
/// or looking around the sample workspace with no account.
struct WelcomeView: View {
    @Environment(AppModel.self) private var model
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let promises: [(symbol: String, title: String, text: String)] = [
        ("checkmark.seal", "Approve with Face ID", "Each change shows its files as a diff, the checks that will run and its hash. You approve exactly what you read."),
        ("sparkles", "Build from one sentence", "Describe it, approve the plan, and the agent starts in Farbaek's cloud."),
        ("bell.badge", "Know when it's ready", "A notification when a build finishes or its checks end."),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                HStack(spacing: 8) {
                    Image("Logo").resizable().scaledToFit().frame(height: 44).accessibilityHidden(true)
                    Text("Farbaek").font(.system(size: 20, weight: .semibold)).tracking(-0.4).foregroundStyle(Palette.ink)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Farbaek")

                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 12) {
                        AgentOrb(live: true, size: 40)
                        Text("Farbaek for iPhone")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(Palette.ink2)
                    }
                    Text("Approve what your agent builds, wherever you are.")
                        .font(.system(size: 34, weight: .medium))
                        .tracking(-0.9)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Nothing applies until you confirm it on this phone.")
                        .font(.body)
                        .foregroundStyle(Palette.ink2)
                }

                VStack(spacing: 10) {
                    ForEach(Array(promises.enumerated()), id: \.offset) { index, promise in
                        HStack(alignment: .top, spacing: 14) {
                            Image(systemName: promise.symbol)
                                .font(.title3)
                                .foregroundStyle(Palette.accent)
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(promise.title).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                                Text(promise.text).font(.subheadline).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .card()
                        .opacity(appeared || reduceMotion ? 1 : 0)
                        .offset(y: appeared || reduceMotion ? 0 : 12)
                        .animation(.spring(response: 0.5, dampingFraction: 0.85).delay(Double(index) * 0.06), value: appeared)
                    }
                }

                VStack(spacing: 12) {
                    Button {
                        Task { await model.signIn() }
                    } label: {
                        if model.signingIn {
                            ProgressView().tint(Palette.onPrimary)
                        } else {
                            Text("Sign in with Farbaek")
                        }
                    }
                    .buttonStyle(PillButtonStyle(kind: .primary))
                    .disabled(model.signingIn)

                    Button("Look around with sample data") {
                        Task { await model.trySample() }
                    }
                    .buttonStyle(PillButtonStyle(kind: .secondary))
                    .disabled(model.signingIn)

                    if let error = model.signInError {
                        Notice(text: error, tone: .failed, symbol: "exclamationmark.triangle.fill")
                    }
                    Text("Signing in opens www.farbaek.com. If you're new, the same page makes your account.")
                        .font(.footnote)
                        .foregroundStyle(Palette.ink3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                HStack(spacing: 20) {
                    Link("Privacy", destination: AppConfig.privacyURL)
                    Link("Terms", destination: AppConfig.termsURL)
                }
                .font(.footnote.weight(.medium))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 28)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.canvas.ignoresSafeArea())
        .onAppear { appeared = true }
    }
}
