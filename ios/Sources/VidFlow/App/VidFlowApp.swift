import SwiftUI
import SwiftData
import UserNotifications

@main
struct VidFlowApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didRegisterForRemoteNotificationsWithDeviceTokenPublisher)) { notification in
                    guard let tokenData = notification.object as? Data else { return }
                    Task {
                        await appState.pushService.uploadPushToken(tokenData, using: appState.apiClient)
                    }
                }
        }
        .modelContainer(for: [
            UserModel.self,
            VideoModel.self,
            FriendModel.self,
        ])
    }
}
