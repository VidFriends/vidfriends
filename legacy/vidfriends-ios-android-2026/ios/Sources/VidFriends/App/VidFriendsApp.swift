import SwiftUI
import SwiftData
import UserNotifications

@main
struct VidFriendsApp: App {
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
            CommentModel.self,
            DownloadedVideo.self,
        ]) { result in
            if case .success(let container) = result {
                appState.configureOfflineService(with: container.mainContext)
            }
        }
    }
}
