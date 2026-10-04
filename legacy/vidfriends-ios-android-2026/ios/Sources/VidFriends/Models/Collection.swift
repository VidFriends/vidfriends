import Foundation

struct Collection: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    let name: String
    let videoCount: Int?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, name
        case userId = "user_id"
        case videoCount = "video_count"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct CreateCollectionRequest: Encodable {
    let name: String
}

struct UpdateProfileRequest: Encodable {
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
    }
}

struct VideoWithUser: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    let title: String
    let description: String?
    let fileURL: String?
    let thumbnailURL: String?
    let duration: String?
    let status: String
    let createdAt: String
    let updatedAt: String
    let userName: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description, duration, status
        case userId = "user_id"
        case fileURL = "file_url"
        case thumbnailURL = "thumbnail_url"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case userName = "user_name"
    }
}

struct SentVideo: Identifiable, Codable, Hashable {
    let id: String
    let videoId: String
    let recipientId: String
    let recipientName: String
    let title: String
    let thumbnailURL: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, title
        case videoId = "video_id"
        case recipientId = "recipient_id"
        case recipientName = "recipient_name"
        case thumbnailURL = "thumbnail_url"
        case createdAt = "created_at"
    }
}
