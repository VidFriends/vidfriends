import Foundation

struct VideoDownloadResponse: Codable {
    let url: String
    let fileName: String?

    enum CodingKeys: String, CodingKey {
        case url
        case fileName = "file_name"
    }
}

struct BlockedUser: Identifiable, Codable, Hashable {
    let id: String
    let username: String
    let displayName: String?
    let blockedAt: String

    enum CodingKeys: String, CodingKey {
        case id, username
        case displayName = "display_name"
        case blockedAt = "blocked_at"
    }
}

struct PushSettings: Codable {
    let notificationsEnabled: Bool
    let newVideoAlerts: Bool
    let friendRequestAlerts: Bool

    enum CodingKeys: String, CodingKey {
        case notificationsEnabled = "notifications_enabled"
        case newVideoAlerts = "new_video_alerts"
        case friendRequestAlerts = "friend_request_alerts"
    }
}
