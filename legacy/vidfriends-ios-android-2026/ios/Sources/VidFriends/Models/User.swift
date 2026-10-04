import Foundation
import SwiftData

// MARK: - API Response Model

struct User: Identifiable, Codable, Hashable {
    let id: String
    let email: String
    let username: String
    let displayName: String?
    let avatarURL: String?
    let role: String
    let status: String
    let storageUsed: Int64?
    let lastActiveAt: String?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, email, username, role, status
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case storageUsed = "storage_used"
        case lastActiveAt = "last_active_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - SwiftData Persistent Model

@Model
final class UserModel {
    @Attribute(.unique) var id: String
    var email: String
    var username: String
    var displayName: String?
    var avatarURL: String?
    var role: String
    var status: String
    var storageUsed: Int64
    var lastActiveAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String, email: String, username: String,
        displayName: String? = nil, avatarURL: String? = nil,
        role: String, status: String, storageUsed: Int64 = 0,
        lastActiveAt: Date? = nil, createdAt: Date = .now, updatedAt: Date = .now
    ) {
        self.id = id
        self.email = email
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.role = role
        self.status = status
        self.storageUsed = storageUsed
        self.lastActiveAt = lastActiveAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
