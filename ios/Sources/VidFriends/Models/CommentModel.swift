import Foundation
import SwiftData

@Model
final class CommentModel {
    @Attribute(.unique) var id: String
    var userId: String
    var userName: String?
    var videoId: String?
    var parentId: String?
    var body: String
    var createdAt: Date

    init(
        id: String, userId: String, userName: String? = nil,
        videoId: String? = nil, parentId: String? = nil,
        body: String, createdAt: Date = .now
    ) {
        self.id = id
        self.userId = userId
        self.userName = userName
        self.videoId = videoId
        self.parentId = parentId
        self.body = body
        self.createdAt = createdAt
    }
}
