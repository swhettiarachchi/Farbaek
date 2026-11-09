import SwiftUI
import UIKit

/// The account, the workspace, this phone's notifications, and signing out.
struct YouView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @State private var confirmSignOut = false
    @State private var showPlans = false
    @State private var manageSubscription = false
    @State private var aiAllowed = AIConsent.given

    /// Everything else Farbaek does, with the web's own words (ADR 0173). Billing is deliberately not here.
    private struct WebTool: Identifiable {
        let title: String
        let about: String
        let path: String
        let symbol: String

        var id: String { path }
    }

    private static let webTools: [WebTool] = [
        WebTool(title: "Test space", about: "Run an app and try it, safely apart from everything else.", path: "app/sandbox", symbol: "terminal"),
        WebTool(title: "Skills", about: "Teach the agent how to design and build, from a library or your own.", path: "app/skills", symbol: "book"),
        WebTool(title: "Desktop app", about: "Let the agent work on your own computer.", path: "app/agents", symbol: "desktopcomputer"),
        WebTool(title: "Move projects", about: "Send a project to another computer or workspace as one file.", path: "app/mesh", symbol: "shippingbox"),
        WebTool(title: "Workflows", about: "A bigger goal, done step by step.", path: "app/workflows", symbol: "arrow.triangle.branch"),
        WebTool(title: "Rules", about: "What needs a person's approval before it changes.", path: "app/policies", symbol: "checklist"),
        WebTool(title: "Problems and pause", about: "What went wrong, and a button that stops every agent.", path: "app/incidents", symbol: "exclamationmark.triangle"),
        WebTool(title: "History", about: "Everything that has happened in this workspace.", path: "app/activity", symbol: "clock.arrow.circlepath"),
        WebTool(title: "Connections", about: "GitHub, hosting and the other services you've linked.", path: "app/integrations", symbol: "link"),
        WebTool(title: "Who can do what", about: "See who and what can change each project.", path: "app/trust", symbol: "person.2"),
        WebTool(title: "Settings", about: "Your workspace, and the people in it.", path: "app/settings", symbol: "gearshape"),
        WebTool(title: "Help and support", about: "Ask a question or report a problem, and read the replies.", path: "app/help", symbol: "lifepreserver"),
    ]

    var body: some View {
        List {
            if model.isSample {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        SampleLabel()
                        Text("You're looking at a sample workspace. Nothing here is real, and nothing can change.").font(.subheadline).foregroundStyle(Palette.ink2)
                    }
                    .padding(.vertical, 4)
                    Button("Sign in or make an account") { Task { await model.signOut() } }
                }
            } else if let me = model.me {
                Section {
                    LabeledContent("Signed in as") { Text(me.user.email).foregroundStyle(Palette.ink2).lineLimit(1) }
                    if let role = me.role { LabeledContent("Role") { Text(role.capitalized).foregroundStyle(Palette.ink2) } }
                } header: {
                    // Each section's title carries its concept's symbol (ADR 0183), the twin of the web's icon.
                    Label("Account", systemImage: "person.crop.circle")
                }
            }

            if let me = model.me, !me.workspaces.isEmpty {
                Section {
                    ForEach(me.workspaces) { workspace in
                        Button {
                            model.selectWorkspace(workspace.id)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(workspace.name).foregroundStyle(Palette.ink)
                                    Text(workspace.plan).font(.footnote).foregroundStyle(Palette.ink3)
                                }
                                Spacer()
                                if workspace.id == model.currentWorkspace?.id {
                                    Image(systemName: "checkmark").foregroundStyle(Palette.accent).accessibilityLabel("Open now")
                                }
                            }
                            .frame(minHeight: 44)
                        }
                    }
                } header: {
                    Label("Workspace", systemImage: "building.2")
                }
            }

            if !model.isSample, let workspace = model.currentWorkspace {
                Section {
                    LabeledContent("Plan") { Text(workspace.plan).foregroundStyle(Palette.ink2) }
                    if let billing = model.me?.billing, billing.applePurchases, billing.canManage, billing.managedBy != "web" {
                        Button {
                            showPlans = true
                        } label: {
                            Label(billing.managedBy == "apple" ? "Change plan" : "Choose a plan", systemImage: "rectangle.stack")
                        }
                        if billing.managedBy == "apple" {
                            Button {
                                manageSubscription = true
                            } label: {
                                Label("Manage subscription", systemImage: "creditcard")
                            }
                        }
                    } else if model.me?.billing?.managedBy == "web" {
                        Text("Billed on www.farbaek.com, so it's changed there.").font(.footnote).foregroundStyle(Palette.ink2)
                    }
                    if model.canBuyOnWeb, model.me?.billing?.managedBy != "apple" {
                        Link(destination: WebPurchase.billingURL) {
                            Label("Upgrade or manage your plan", systemImage: "arrow.up.right.square")
                        }
                    }
                } header: {
                    Label("Plan", systemImage: "creditcard")
                } footer: {
                    if model.canBuyOnWeb {
                        Text("Opens Billing on www.farbaek.com in Safari, where plans are bought and managed.")
                    }
                }
            }

            if !model.isSample { notifications }

            if !model.isSample {
                Section {
                    Toggle("Allow AI to work on my builds", isOn: $aiAllowed)
                } header: {
                    Label("AI", systemImage: "hand.raised")
                } footer: {
                    Text("What you write and your project's files go to Anthropic (Claude) or Google (Gemini) to plan and build. Turned off, nothing more is sent from this iPhone. A run that's already going keeps working until it ends or you stop it.")
                }
            }

            Section {
                ForEach(Self.webTools) { tool in
                    WebLink(path: tool.path) {
                        HStack(spacing: 12) {
                            Image(systemName: tool.symbol).foregroundStyle(Palette.accent).frame(width: 24).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tool.title).foregroundStyle(Palette.ink)
                                Text(tool.about).font(.footnote).foregroundStyle(Palette.ink2)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "arrow.up.right").font(.footnote).foregroundStyle(Palette.ink3).accessibilityHidden(true)
                        }
                        .frame(minHeight: 44)
                    }
                }
            } header: {
                Label("More tools", systemImage: "ellipsis.circle")
            } footer: {
                Text("These open right here, already signed in.")
            }

            Section {
                WebLink(path: "app") { Label("Open Farbaek on the web", systemImage: "safari") }
                Link(destination: AppConfig.privacyURL) { Label("Privacy", systemImage: "hand.raised") }
                Link(destination: AppConfig.termsURL) { Label("Terms", systemImage: "doc.plaintext") }
                if let mail = URL(string: "mailto:\(AppConfig.supportEmail)") {
                    Link(destination: mail) { Label("Write to support", systemImage: "envelope") }
                }
            } header: {
                Label("Farbaek", systemImage: "lifepreserver")
            }

            if !model.isSample {
                Section {
                    Link(destination: AppConfig.deleteAccountURL) { Label("Delete your account", systemImage: "trash") }
                        .foregroundStyle(Palette.failed)
                } footer: {
                    Text("Opens Settings on www.farbaek.com, where you confirm it. Your workspaces' owners keep what belongs to the workspace.")
                }
            }

            Section {
                Button(model.isSample ? "Leave the sample" : "Sign out", role: model.isSample ? nil : .destructive) {
                    if model.isSample { Task { await model.signOut() } } else { confirmSignOut = true }
                }
            } footer: {
                Text("Farbaek for iPhone \(AppConfig.appVersion)")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle("You")
        .confirmationDialog("Sign out of Farbaek on this phone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await model.signOut() } }
        } message: {
            Text("This phone is disconnected and stops getting notifications. Sign in again any time.")
        }
        .refreshable {
            await model.loadMe(as: model.phase)
            await model.readNotificationPermission()
        }
        .task { await model.readNotificationPermission() }
        // Back from Settings: say what's true now.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.readNotificationPermission() } }
        }
        .onAppear { aiAllowed = AIConsent.given }
        .onChange(of: aiAllowed) { _, allowed in AIConsent.given = allowed }
        .sheet(isPresented: $showPlans) { PlansView().environment(model) }
        .manageSubscriptionsSheet(isPresented: $manageSubscription)
    }

    @ViewBuilder private var notifications: some View {
        Section {
            if let push = model.me?.push {
                if !push.available {
                    Text("Notifications on iPhone aren't set up on Farbaek's server yet. Everything still shows here when you open the app.")
                        .font(.subheadline)
                        .foregroundStyle(Palette.ink2)
                } else if model.notificationsDenied {
                    // Whatever Farbaek has on record, iOS decides what shows: say so, and offer the way to change it.
                    VStack(alignment: .leading, spacing: 4) {
                        // A warning to look at, in burnt orange with its mark (ADR 0183), not the blue of your turn.
                        Label("Turned off in the iPhone's Settings", systemImage: Tone.attention.symbol)
                            .foregroundStyle(Palette.caution)
                        Text("Nothing Farbaek sends can show on this iPhone until notifications are allowed for it.")
                            .font(.footnote)
                            .foregroundStyle(Palette.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 4)
                    Button("Open Settings") {
                        if let settings = URL(string: UIApplication.openSettingsURLString) { openURL(settings) }
                    }
                } else if push.on {
                    Label("On for this iPhone", systemImage: "bell.badge.fill").foregroundStyle(Palette.verified)
                    Button("Turn off") { Task { await model.disableNotifications() } }
                } else {
                    Button {
                        Task { await model.enableNotifications() }
                    } label: {
                        Label("Turn on notifications", systemImage: "bell")
                    }
                }
            }
            if let note = model.pushNote {
                Notice(text: note, tone: .failed, symbol: "exclamationmark.circle.fill")
            }
        } header: {
            Label("Notifications", systemImage: "bell")
        } footer: {
            Text("When a build finishes or its checks end. The same moments as Farbaek's emails.")
        }
    }
}
