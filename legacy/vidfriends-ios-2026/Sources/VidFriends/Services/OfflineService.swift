import Foundation
import SwiftData

@Observable
final class OfflineService {
    let modelContext: ModelContext
    let operationQueue = OfflineOperationQueue()

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - Feed caching

    func cacheFeed(_ videos: [Video]) {
        for video in videos {
            let model = VideoModel(
                id: video.id, userId: video.userId, title: video.title,
                videoDescription: video.description, fileURL: video.fileURL,
                thumbnailURL: video.thumbnailURL, duration: video.duration,
                status: video.status,
                createdAt: parseDate(video.createdAt),
                updatedAt: parseDate(video.updatedAt)
            )
            modelContext.insert(model)
        }
        try? modelContext.save()
    }

    func cachedFeed() -> [VideoModel] {
        let descriptor = FetchDescriptor<VideoModel>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    // MARK: - Comments caching

    func cacheComments(_ comments: [Comment], videoId: String) {
        for comment in comments {
            let model = CommentModel(
                id: comment.id, userId: comment.userId,
                userName: comment.userName, videoId: videoId,
                parentId: comment.parentId, body: comment.body,
                createdAt: parseDate(comment.createdAt)
            )
            modelContext.insert(model)
        }
        try? modelContext.save()
    }

    func cachedComments(videoId: String) -> [CommentModel] {
        let predicate = #Predicate<CommentModel> { $0.videoId == videoId }
        let descriptor = FetchDescriptor<CommentModel>(predicate: predicate, sortBy: [SortDescriptor(\.createdAt)])
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    // MARK: - Sync

    func processPendingOperations(using apiClient: APIClientProtocol) async {
        let operations = await operationQueue.peek()
        for op in operations {
            do {
                switch op.type {
                case .likeVideo(let id):
                    try await apiClient.likeVideo(id: id)
                case .unlikeVideo(let id):
                    try await apiClient.unlikeVideo(id: id)
                case .postComment(let videoId, let body, let parentId):
                    try await apiClient.postComment(videoId: videoId, body: body, parentId: parentId)
                case .markWatched(let videoId, let progressSeconds):
                    try await apiClient.markWatched(videoId: videoId, progressSeconds: progressSeconds)
                case .updateInboxItem(let id, let status):
                    try await apiClient.updateInboxItem(id: id, status: status)
                case .respondToFriendRequest(let id, let accept):
                    try await apiClient.respondToFriendRequest(id: id, accept: accept)
                case .blockUser(let id):
                    try await apiClient.blockUser(id: id)
                case .unblockUser(let id):
                    try await apiClient.unblockUser(id: id)
                case .unsendVideo(let id):
                    try await apiClient.unsendVideo(id: id)
                }
                await operationQueue.remove(id: op.id)
            } catch {
                // Leave in queue for next retry
            }
        }
    }

    // MARK: - Helpers

    private static let dateFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func parseDate(_ string: String) -> Date {
        Self.dateFormatter.date(from: string) ?? .now
    }
}

extension VideoModel {
    func toVideo() -> Video? {
        let formatter = ISO8601DateFormatter()
        return Video(
            id: id, userId: userId, title: title,
            description: videoDescription, fileURL: fileURL,
            thumbnailURL: thumbnailURL, duration: duration,
            status: status,
            createdAt: formatter.string(from: createdAt),
            updatedAt: formatter.string(from: updatedAt),
            likeCount: nil, commentCount: nil, liked: nil, userName: nil
        )
    }
}
