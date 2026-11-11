import SafariServices
import SwiftUI

/// A page the app has no screen for, opened in the in-app browser, signed in by a one-time link (ADR 0177).
struct WebPage: Identifiable {
    let id = UUID()
    let url: URL
}

private struct WebLinkReply: Decodable {
    let url: URL
}

extension AppModel {
    /// The address to open. If the one-time link can't be made, the page still opens and the person signs in there.
    func webPage(_ path: String) async -> WebPage {
        if let reply: WebLinkReply = try? await api.send("POST", "web-link", body: ["path": path]) {
            return WebPage(url: reply.url)
        }
        // Still with the mark that keeps purchases off these pages, however it opens (ADR 0177).
        var plain = URLComponents(url: AppConfig.site(path), resolvingAgainstBaseURL: false)
        plain?.queryItems = [URLQueryItem(name: "client", value: "ios-app")]
        return WebPage(url: plain?.url ?? AppConfig.site(path))
    }
}

private struct BillingLinkReply: Decodable {
    let url: URL
}

extension AppModel {
    /// Billing on www.farbaek.com, signed in, on this workspace, at a plan's checkout when one is named (ADR 0186).
    /// Only where Apple allows a link to it: the United States App Store (WebPurchase.allowed).
    func webBillingURL(plan: String?) async -> URL {
        var body: [String: Any] = [:]
        if let plan { body["plan"] = plan }
        if let reply: BillingLinkReply = try? await api.send("POST", "billing-link", body: body) {
            return reply.url
        }
        // Still Billing on the web: the person signs in there.
        return WebPurchase.billingURL
    }
}

/// Opens Billing on www.farbaek.com in Safari, signed in, at the plan's checkout: a tick and a card, then back here.
struct WebPurchaseButton<Label: View>: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    var plan: String? = nil
    @ViewBuilder let label: () -> Label
    @State private var opening = false

    var body: some View {
        Button {
            guard !opening else { return }
            opening = true
            Task {
                let url = await model.webBillingURL(plan: plan)
                opening = false
                openURL(url)
            }
        } label: {
            // The one-time sign-in link takes a moment to make: a spinner says it's on its way.
            HStack(spacing: 8) {
                label()
                if opening { ProgressView().controlSize(.small) }
            }
        }
        .disabled(opening)
    }
}

/// The system's in-app browser: it keeps its own sign-in, and the person can see what they're looking at.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let page = SFSafariViewController(url: url)
        page.dismissButtonStyle = .done
        page.preferredControlTintColor = UIColor(Palette.accent)
        return page
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// A row or button that opens one of the app's web pages right here.
struct WebLink<Label: View>: View {
    @Environment(AppModel.self) private var model
    let path: String
    @ViewBuilder let label: () -> Label
    @State private var page: WebPage?
    @State private var opening = false

    var body: some View {
        Button {
            guard !opening else { return }
            opening = true
            Task {
                page = await model.webPage(path)
                opening = false
            }
        } label: {
            // The one-time sign-in link takes a moment to make: a spinner says it's on its way.
            HStack(spacing: 8) {
                label()
                if opening {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Opening")
                }
            }
        }
        .sheet(item: $page) { SafariView(url: $0.url).ignoresSafeArea() }
    }
}
