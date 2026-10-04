import Foundation

struct Comment: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    let userName: String?
    let videoId: String?
    let parentId: String?
    let body: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, body
        case userId = "user_id"
        case userName = "user_name"
        case videoId = "video_id"
        case parentId = "parent_id"
        case createdAt = "created_at"
    }
}

struct CreateCommentRequest: Encodable {
    let body: String
    let parentId: String?

    enum CodingKeys: String, CodingKey {
        case body
        case parentId = "parent_id"
    }
}

struct CreateCommentResponse: Decodable {
    let id: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case createdAt = "created_at"
    }
}
