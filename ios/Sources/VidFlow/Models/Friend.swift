import Foundation
import SwiftData

// MARK: - API Response Model

struct Friend: Identifiable, Codable, Hashable {
    let id: String
    let requesterId: String
    let addresseeId: String
    let status: String
    let username: String?
    let displayName: String?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, status
        case requesterId = "requester_id"
        case addresseeId = "addressee_id"
        case username
        case displayName = "display_name"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - SwiftData Persistent Model

@Model
final class FriendModel {
    @Attribute(.unique) var id: String
    var requesterId: String
    var addresseeId: String
    var status: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String, requesterId: String, addresseeId: String,
        status: String, createdAt: Date = .now, updatedAt: Date = .now
    ) {
        self.id = id
        self.requesterId = requesterId
        self.addresseeId = addresseeId
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
