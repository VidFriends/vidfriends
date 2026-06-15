import SwiftUI
import UserNotifications

extension Notification.Name {
    static let didReceiveForegroundNotification = Notification.Name("didReceiveForegroundNotification")
}

@Observable
final class PushNotificationService: NSObject {
    private var hasRegistered = false

    func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()
        do {
            return try await center.requestAuthorization(options: [.alert, .badge, .sound])
        } catch {
            return false
        }
    }

    func registerForRemoteNotifications() {
        guard !hasRegistered else { return }
        hasRegistered = true
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func setDelegate() {
        UNUserNotificationCenter.current().delegate = self
    }

    func uploadPushToken(_ tokenData: Data, using apiClient: APIClientProtocol) async {
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        do {
            try await apiClient.registerPushToken(token: token)
        } catch {
            print("Failed to register push token: \(error.localizedDescription)")
        }
    }

    func handleForegroundNotification(_ userInfo: [AnyHashable: Any]) {
        NotificationCenter.default.post(
            name: .didReceiveForegroundNotification,
            object: nil,
            userInfo: userInfo
        )
    }
}

extension PushNotificationService: UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        handleForegroundNotification(notification.request.content.userInfo)
        completionHandler([.banner, .sound])
    }
}
