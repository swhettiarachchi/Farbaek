import Observation
import SwiftUI
import UIKit
import UserNotifications

enum AppTab: Hashable {
    case today, approvals, build, tasks, you
}

/// A screen any tab can open.
enum Destination: Hashable {
    case approval(String)
    case task(String)
    case plan(String)
    case run(String)
}

/// The app's state: who's signed in (or the sample), the workspace, the tabs
/// and where each is, and this phone's notifications.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case loading, signedOut, signedIn, sample
    }

    var phase: Phase = .loading
    var me: Me?
    var tab: AppTab = .today
    var todayPath = NavigationPath()
    var approvalsPath = NavigationPath()
    var buildPath = NavigationPath()
    var tasksPath = NavigationPath()
    /// Changes waiting for this person, for the Approvals badge.
    var waiting = 0
    /// Moves on after every change, so screens read again.
    var revision = 0
    var signingIn = false
    var signInError: String?
    var pushNote: String?

    let api = APIClient(base: AppConfig.baseURL)
    private let web = WebSignIn()
    @ObservationIgnored private var pendingPath: String?

    init() {
        api.workspaceId = UserDefaults.standard.string(forKey: "workspace")
        api.onSignedOut = { [weak self] in self?.signedOutElsewhere() }
        Task { await self.start() }
    }

    var isSample: Bool { phase == .sample }
    var currentWorkspace: Workspace? { me?.workspaces.first { $0.id == api.workspaceId } ?? me?.workspaces.first }

    /// Why this person can't change anything here, or nil when they can.
    var writeBlocker: String? {
        if phase == .sample { return "This is sample data, so nothing here can change. Sign in to approve and build for real." }
        guard let me else { return "Farbaek couldn't load your account yet. Pull to refresh." }
        if currentWorkspace == nil { return "Create a workspace on www.farbaek.com first." }
        return me.writes.enabled ? nil : me.writes.reason
    }

    func start() async {
        // The UI tour (FarbaekUITests) opens the sample straight away.
        if ProcessInfo.processInfo.arguments.contains("-FarbaekSample") {
            await trySample()
            return
        }
        guard api.hasSession else {
            phase = .signedOut
            return
        }
        await loadMe(as: .signedIn)
        await refreshPushToken()
    }

    func loadMe(as next: Phase) async {
        do {
            let me: Me = try await api.get("me")
            self.me = me
            if !me.workspaces.contains(where: { $0.id == api.workspaceId }) { api.workspaceId = me.current }
            phase = next
            if let path = pendingPath {
                pendingPath = nil
                openPath(path)
            }
        } catch {
            if next == .sample {
                api.sample = false
                signInError = error.localizedDescription
                phase = .signedOut
            } else {
                // Still signed in when the network is down: screens say what they couldn't load.
                phase = api.hasSession ? .signedIn : .signedOut
            }
        }
    }

    func signIn() async {
        signInError = nil
        signingIn = true
        defer { signingIn = false }
        let request = WebSignIn.request(device: UIDevice.current.model)
        do {
            let code = try await web.code(for: request)
            let grant: TokenGrant = try await api.signInStep("token", body: ["code": code, "verifier": request.verifier, "appVersion": AppConfig.appVersion])
            api.sample = false
            api.adopt(grant)
            await loadMe(as: .signedIn)
        } catch SignInError.cancelled {
            return
        } catch {
            signInError = error.localizedDescription
        }
    }

    func trySample() async {
        signInError = nil
        api.sample = true
        await loadMe(as: .sample)
    }

    func signOut() async {
        if phase == .signedIn {
            _ = try? await api.send("DELETE", "session", as: SignedOut.self)
        }
        api.forget()
        api.sample = false
        resetScreens()
        me = nil
        phase = .signedOut
    }

    private func signedOutElsewhere() {
        resetScreens()
        me = nil
        phase = .signedOut
        signInError = "This phone was signed out of Farbaek. Sign in again to continue."
    }

    private func resetScreens() {
        tab = .today
        todayPath = NavigationPath()
        approvalsPath = NavigationPath()
        buildPath = NavigationPath()
        tasksPath = NavigationPath()
        waiting = 0
    }

    func selectWorkspace(_ id: String) {
        guard id != api.workspaceId else { return }
        api.workspaceId = id
        UserDefaults.standard.set(id, forKey: "workspace")
        resetScreens()
        changed()
    }

    func changed() {
        revision += 1
    }

    // MARK: Links

    /// farbaek:// links the system opens. farbaek://connected arrives this way when the
    /// sign-in email was opened in Safari and the person connected there.
    func open(url: URL) {
        guard url.scheme == "farbaek", url.host == "connected" else { return }
        if !web.receive(url), phase == .signedOut {
            signInError = "That sign-in started earlier and was closed. Tap Sign in with Farbaek again: you're signed in on the web now, so it takes one tap."
        }
    }


    /// Opens a Farbaek path, such as /app/tasks/<id>, in the tab it belongs to.
    func openPath(_ path: String) {
        guard phase == .signedIn || phase == .sample else {
            pendingPath = path
            return
        }
        let parts = path.split(separator: "/").map(String.init)
        guard parts.first == "app", parts.count >= 2 else { return }
        switch parts[1] {
        case "tasks" where parts.count >= 3:
            tab = .tasks
            tasksPath = NavigationPath([Destination.task(parts[2])])
        case "build" where parts.count >= 3:
            tab = .build
            buildPath = NavigationPath([Destination.run(parts[2])])
        case "approvals":
            tab = .approvals
        default:
            tab = .today
        }
    }

    // MARK: Notifications (APNs, ADR 0110)

    func enableNotifications() async {
        pushNote = nil
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else {
            pushNote = "Notifications are off for Farbaek. Turn them on in the iPhone's Settings, then try again."
            return
        }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// Apple can change a phone's token, so a signed-in phone that allowed notifications registers on each launch.
    private func refreshPushToken() async {
        guard phase == .signedIn, me?.push.on == true else { return }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        if settings.authorizationStatus == .authorized { UIApplication.shared.registerForRemoteNotifications() }
    }

    func pushRegistered(token: String) async {
        guard phase == .signedIn else { return }
        #if DEBUG
        let environment = "development"
        #else
        let environment = "production"
        #endif
        do {
            _ = try await api.send("PUT", "push", body: ["token": token, "environment": environment], as: PushState.self)
            pushNote = nil
            await loadMe(as: .signedIn)
        } catch {
            pushNote = error.localizedDescription
        }
    }

    func pushFailed(_ message: String) {
        pushNote = "This iPhone couldn't register for notifications: \(message)"
    }

    func disableNotifications() async {
        do {
            _ = try await api.send("DELETE", "push", as: PushState.self)
            UIApplication.shared.unregisterForRemoteNotifications()
            await loadMe(as: .signedIn)
        } catch {
            pushNote = error.localizedDescription
        }
    }
}
