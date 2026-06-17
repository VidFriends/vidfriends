import Foundation

struct Like: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    let videoId: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case videoId = "video_id"
        case createdAt = "created_at"
    }
}

struct LikeResponse: Decodable {
    let status: String
}

struct WatchHistoryEntry: Identifiable, Codable {
    let id: String
    let title: String
    let thumbnailURL: String?
    let userName: String
    let watchedAt: String
    let progressSeconds: Int

    enum CodingKeys: String, CodingKey {
        case id, title
        case thumbnailURL = "thumbnail_url"
        case userName = "user_name"
        case watchedAt = "watched_at"
        case progressSeconds = "progress_seconds"
    }
}

struct MarkWatchedRequest: Encodable {
    let progressSeconds: Int

    enum CodingKeys: String, CodingKey {
        case progressSeconds = "progress_seconds"
    }
}
