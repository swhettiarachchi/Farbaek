import SwiftUI

/// The account, the workspace, this phone's notifications, and signing out.
struct YouView: View {
    @Environment(AppModel.self) private var model
    @State private var confirmSignOut = false
    @State private var showPlans = false
    @State private var manageSubscription = false

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
                Section("Account") {
                    LabeledContent("Signed in as") { Text(me.user.email).foregroundStyle(Palette.ink2).lineLimit(1) }
                    if let role = me.role { LabeledContent("Role") { Text(role.capitalized).foregroundStyle(Palette.ink2) } }
                }
            }

            if let me = model.me, !me.workspaces.isEmpty {
                Section("Workspace") {
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
                }
            }

            if !model.isSample, let workspace = model.currentWorkspace {
                Section {
                    LabeledContent("Plan") { Text(workspace.plan).foregroundStyle(Palette.ink2) }
                    if let billing = model.me?.billing, billing.applePurchases, billing.canManage, billing.managedBy != "web" {
                        Button {
                            showPlans = true
                        } label: {
                            Label(billing.managedBy == "apple" ? "Change plan" : "Choose a plan", systemImage: "sparkles")
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
                    Text("Plan")
                } footer: {
                    if model.canBuyOnWeb {
                        Text("Opens Billing on www.farbaek.com in Safari, where plans are bought and managed.")
                    }
                }
            }

            if !model.isSample { notifications }

            Section("Farbaek") {
                Link(destination: AppConfig.site("app")) { Label("Open Farbaek on the web", systemImage: "safari") }
                Link(destination: AppConfig.privacyURL) { Label("Privacy", systemImage: "hand.raised") }
                Link(destination: AppConfig.termsURL) { Label("Terms", systemImage: "doc.plaintext") }
                if let mail = URL(string: "mailto:\(AppConfig.supportEmail)") {
                    Link(destination: mail) { Label("Write to support", systemImage: "envelope") }
                }
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
        .refreshable { await model.loadMe(as: model.phase) }
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
                Notice(text: note, tone: .failed, symbol: "exclamationmark.triangle")
            }
        } header: {
            Text("Notifications")
        } footer: {
            Text("When a build finishes or its checks end. The same moments as Farbaek's emails.")
        }
    }
}
