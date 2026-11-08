import StoreKit
import SwiftUI

/// Plans through the App Store (ADR 0112): one tap with Face ID, billed to the
/// Apple account, renewing monthly until cancelled in Settings. Each purchase
/// carries the workspace's id, so Apple's signed record names the workspace
/// it pays for, and Farbaek checks that record before the plan changes.
struct PlansView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var products: [Product] = []
    @State private var loading = true
    @State private var working: String?
    @State private var failure: String?
    @State private var done: String?
    @State private var manage = false

    private var currentPlan: String? { model.currentWorkspace?.plan }
    private var billedByApple: Bool { model.me?.billing?.managedBy == "apple" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("More usage, stronger models and more projects. Your plan works on the web and on this iPhone.")
                        .font(.subheadline)
                        .foregroundStyle(Palette.ink2)
                        .fixedSize(horizontal: false, vertical: true)

                    if loading {
                        ProgressView().tint(Palette.accent).frame(maxWidth: .infinity, minHeight: 200)
                    } else if products.isEmpty {
                        Notice(text: "The App Store didn't send the plans. Check your connection and try again in a moment.", tone: .attention, symbol: "exclamationmark.icloud")
                            .card()
                    }
                    ForEach(products, id: \.id) { product in
                        planCard(product)
                    }

                    if let failure { Notice(text: failure, tone: .failed, symbol: "exclamationmark.circle.fill") }
                    if let done { Notice(text: done, tone: .verified, symbol: "checkmark.circle.fill").card() }

                    Text("Billed monthly to your Apple account. It renews automatically each month at the price shown until you cancel, at least 24 hours before it renews, in Settings, your name, Subscriptions.")
                        .font(.footnote)
                        .foregroundStyle(Palette.ink3)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 10) {
                        Button("Restore purchases") { Task { await restore() } }
                            .buttonStyle(PillButtonStyle(kind: .secondary, compact: true))
                        if billedByApple {
                            Button("Manage subscription") { manage = true }
                                .buttonStyle(PillButtonStyle(kind: .secondary, compact: true))
                        }
                    }
                    .disabled(working != nil)

                    // Small words, full-size targets: each link is at least 44pt tall.
                    HStack(spacing: 18) {
                        Link(destination: AppConfig.termsURL) {
                            Text("Terms of Use").frame(minHeight: 44).contentShape(Rectangle())
                        }
                        Link(destination: AppConfig.privacyURL) {
                            Text("Privacy Policy").frame(minHeight: 44).contentShape(Rectangle())
                        }
                    }
                    .font(.footnote.weight(.medium))

                    if model.canBuyOnWeb {
                        Link(destination: WebPurchase.billingURL) {
                            Label("Or pay on www.farbaek.com", systemImage: "arrow.up.right.square")
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .font(.footnote.weight(.medium))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .screenBackground()
            .navigationTitle("Plans")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .manageSubscriptionsSheet(isPresented: $manage)
            .task { await load() }
            .sensoryFeedback(.success, trigger: done)
        }
    }

    private func planCard(_ product: Product) -> some View {
        let current = currentPlan.map { $0.caseInsensitiveCompare(product.displayName) == .orderedSame } ?? false
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(product.displayName).font(.headline.weight(.medium)).foregroundStyle(Palette.ink)
                Spacer()
                Text("\(product.displayPrice) a month").font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
            }
            if !product.description.isEmpty {
                Text(product.description).font(.footnote).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true)
            }
            if current {
                // A tag, not a state (ADR 0183): a neutral pill with no mark.
                Text("Your plan")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Palette.ink2)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .overlay(Capsule().stroke(Palette.line2, lineWidth: 1))
            } else {
                Button {
                    Task { await buy(product) }
                } label: {
                    if working == product.id { ProgressView().tint(Palette.onAccent) } else { Text("Subscribe") }
                }
                .buttonStyle(PillButtonStyle(kind: .accent))
                .disabled(working != nil)
                .accessibilityLabel("Subscribe to \(product.displayName) for \(product.displayPrice) a month")
            }
        }
        .card()
    }

    private func load() async {
        loading = true
        defer { loading = false }
        products = (try? await Purchases.products()) ?? []
    }

    private func buy(_ product: Product) async {
        failure = nil
        done = nil
        guard let token = model.me?.billing?.accountToken, let workspace = UUID(uuidString: token) else {
            failure = "Farbaek couldn't tell which workspace this is for. Pull to refresh on Home, then try again."
            return
        }
        working = product.id
        defer { working = nil }
        do {
            switch try await product.purchase(options: [.appAccountToken(workspace)]) {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    failure = "The App Store couldn't confirm this purchase, so nothing changed. Try Restore purchases."
                    return
                }
                switch await Purchases.report(verification.jwsRepresentation, api: model.api) {
                case .applied:
                    await transaction.finish()
                    done = "You're on \(product.displayName). Its limits apply now, here and on the web."
                    await model.loadMe(as: model.phase)
                    model.changed()
                case .refused(let message):
                    await transaction.finish()
                    failure = message
                case .later:
                    failure = "Apple charged you, and Farbaek will apply the plan as soon as it's reachable. Nothing more to do."
                }
            case .pending:
                done = "Waiting for approval. The plan starts once the purchase is approved."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            failure = error.localizedDescription
        }
    }

    private func restore() async {
        failure = nil
        done = nil
        working = "restore"
        defer { working = nil }
        do {
            let restored = try await Purchases.restore(api: model.api)
            done = restored > 0 ? "Restored. Your plan is back on this workspace." : "This Apple account has no Farbaek subscription to restore."
            await model.loadMe(as: model.phase)
            model.changed()
        } catch {
            failure = error.localizedDescription
        }
    }
}
