import SwiftUI
import UIKit
import UserNotifications

@main
struct FarbaekApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.light)
                .tint(Palette.accent)
                .onAppear { delegate.model = model }
        }
    }
}

/// Apple's push token and taps on notifications reach the app here.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var model: AppModel?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in await self.model?.pushRegistered(token: token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        let message = error.localizedDescription
        Task { @MainActor in self.model?.pushFailed(message) }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let path = response.notification.request.content.userInfo["url"] as? String
        Task { @MainActor in
            if let path { self.model?.openPath(path) }
            completionHandler()
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                VStack(spacing: 24) {
                    HStack(spacing: 8) {
                        Image("Logo").resizable().scaledToFit().frame(height: 44).accessibilityHidden(true)
                        Text("Farbaek").font(.system(size: 20, weight: .semibold)).tracking(-0.4).foregroundStyle(Palette.ink)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Farbaek")
                    ProgressView().tint(Palette.accent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Palette.canvas)
            case .signedOut:
                WelcomeView()
            case .signedIn, .sample:
                MainTabs()
            }
        }
        .animation(.easeOut(duration: 0.26), value: model.phase)
    }
}

struct MainTabs: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            NavigationStack(path: $model.todayPath) {
                TodayView().withDestinations()
            }
            .tabItem { Label("Today", systemImage: "sun.horizon") }
            .tag(AppTab.today)

            NavigationStack(path: $model.approvalsPath) {
                ApprovalsView().withDestinations()
            }
            .tabItem { Label("Approvals", systemImage: "checkmark.seal") }
            .badge(model.waiting)
            .tag(AppTab.approvals)

            NavigationStack(path: $model.buildPath) {
                BuildView().withDestinations()
            }
            .tabItem { Label("Build", systemImage: "sparkles") }
            .tag(AppTab.build)

            NavigationStack(path: $model.tasksPath) {
                TasksView().withDestinations()
            }
            .tabItem { Label("Tasks", systemImage: "list.bullet.rectangle") }
            .tag(AppTab.tasks)

            NavigationStack {
                YouView()
            }
            .tabItem { Label("You", systemImage: "person.crop.circle") }
            .tag(AppTab.you)
        }
    }
}

extension View {
    func withDestinations() -> some View {
        navigationDestination(for: Destination.self) { destination in
            switch destination {
            case .approval(let taskId): ApprovalDetailView(taskId: taskId)
            case .task(let taskId): TaskDetailView(taskId: taskId)
            case .plan(let taskId): PlanReviewView(taskId: taskId)
            case .run(let runId): RunView(runId: runId)
            }
        }
    }
}
