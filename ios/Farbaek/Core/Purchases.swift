import Foundation
import StoreKit

/// Plans sold through the App Store (ADR 0112). The ids match
/// src/core/billing/apple.ts, whose test holds each price to the 57% margin.
enum Purchases {
    static let productIds = [
        "com.farbaek.app.lite.monthly",
        "com.farbaek.app.maker.monthly",
        "com.farbaek.app.starter.monthly",
        "com.farbaek.app.plus.monthly",
        "com.farbaek.app.pro.monthly",
    ]

    /// The plans as the App Store sells them here, cheapest first, in the person's currency.
    static func products() async throws -> [Product] {
        try await Product.products(for: productIds).sorted { $0.price < $1.price }
    }

    /// What Farbaek said about a purchase it was told of.
    enum Report {
        case applied
        /// Farbaek refused it for good (another workspace, billed on the web): finishing it is right.
        case refused(String)
        /// Farbaek couldn't be reached or failed: StoreKit keeps it and offers it again.
        case later(String)
    }

    /// Sends Apple's signed transaction to Farbaek, which checks Apple's signature and sets the workspace's plan.
    @MainActor
    static func report(_ jws: String, api: APIClient) async -> Report {
        do {
            _ = try await api.send("POST", "apple/transactions", body: ["jws": jws], as: AppleApplied.self)
            return .applied
        } catch let error as APIError where (400..<500).contains(error.status) {
            return .refused(error.message)
        } catch {
            return .later(error.localizedDescription)
        }
    }

    /// Renewals, plan changes and refunds StoreKit delivers while the app runs. Each is finished once Farbaek has it.
    @MainActor
    static func listen(api: APIClient) -> Task<Void, Never> {
        Task {
            for await update in Transaction.updates {
                guard case .verified(let transaction) = update else { continue }
                switch await report(update.jwsRepresentation, api: api) {
                case .applied, .refused: await transaction.finish()
                case .later: break
                }
            }
        }
    }

    /// Restore purchases: asks the App Store for this Apple account's subscriptions and tells Farbaek of each.
    @MainActor
    static func restore(api: APIClient) async throws -> Int {
        try await AppStore.sync()
        var reported = 0
        for await entitlement in Transaction.currentEntitlements {
            guard case .verified(let transaction) = entitlement, transaction.productType == .autoRenewable else { continue }
            if case .applied = await report(entitlement.jwsRepresentation, api: api) { reported += 1 }
        }
        return reported
    }
}

struct AppleApplied: Decodable {
    let state: String
    let planId: String?
    let paidThrough: String?
}
