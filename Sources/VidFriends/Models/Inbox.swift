import Foundation

struct InboxItem: Identifiable, Codable, Hashable {
    let id: String
    let videoId: String
    let fromUserId: String
    let fromUserName: String
    let title: String
    let thumbnailURL: String?
    let status: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case videoId = "video_id"
        case fromUserId = "from_user_id"
        case fromUserName = "from_user_name"
        case title
        case thumbnailURL = "thumbnail_url"
        case status
        case createdAt = "created_at"
    }
}

struct UserSearchResult: Identifiable, Codable, Hashable {
    let id: String
    let username: String
    let displayName: String?

    enum CodingKeys: String, CodingKey {
        case id
        case username
        case displayName = "display_name"
    }
}

struct UserSearchResponse: Codable {
    let users: [UserSearchResult]
}

struct PushRegisterRequest: Encodable {
    let token: String
    let platform: String
}

struct UploadResponse: Decodable {
    let url: String
    let fileName: String

    enum CodingKeys: String, CodingKey {
        case url
        case fileName = "file_name"
    }
}

struct SendVideoRequest: Encodable {
    let toUserId: String

    enum CodingKeys: String, CodingKey {
        case toUserId = "to_user_id"
    }
}

struct InboxUpdateRequest: Encodable {
    let status: String
}

struct FriendRequestAction: Encodable {
    let status: String
}