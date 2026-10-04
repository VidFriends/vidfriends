import Foundation
import SwiftData

// MARK: - API Response Model

struct Video: Identifiable, Codable, Hashable {
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
    let likeCount: Int?
    let commentCount: Int?
    let liked: Bool?
    let userName: String?

    enum CodingKeys: String, CodingKey {
        case id, title, description, duration, status, liked
        case userId = "user_id"
        case fileURL = "file_url"
        case thumbnailURL = "thumbnail_url"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case likeCount = "like_count"
        case commentCount = "comment_count"
        case userName = "user_name"
    }
}

struct CreateVideoRequest: Encodable {
    let url: String?
    let title: String?
    let description: String?
}

struct CreateVideoResponse: Decodable {
    let id: String
}

// MARK: - SwiftData Persistent Model

@Model
final class VideoModel {
    @Attribute(.unique) var id: String
    var userId: String
    var title: String
    var videoDescription: String?
    var fileURL: String?
    var thumbnailURL: String?
    var duration: String?
    var status: String
    var createdAt: Date
    var updatedAt: Date

    init(
        id: String, userId: String, title: String,
        videoDescription: String? = nil, fileURL: String? = nil,
        thumbnailURL: String? = nil, duration: String? = nil,
        status: String, createdAt: Date = .now, updatedAt: Date = .now
    ) {
        self.id = id
        self.userId = userId
        self.title = title
        self.videoDescription = videoDescription
        self.fileURL = fileURL
        self.thumbnailURL = thumbnailURL
        self.duration = duration
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
