import Foundation

final class StubAPIClient: APIClientProtocol {
    private let fixedDate = "2026-06-14T00:00:00Z"

    func register(email: String, username: String, password: String, displayName: String?) async throws -> String {
        "stub-token-register-\(UUID().uuidString)"
    }

    func login(email: String, password: String) async throws -> String {
        "stub-token-login-\(UUID().uuidString)"
    }

    func refreshToken() async throws -> String {
        "stub-token-refreshed-\(UUID().uuidString)"
    }

    func getFeed() async throws -> [Video] {
        [
            Video(id: "v1", userId: "u1", title: "Amazing sunset timelapse",
                  description: "Shot this from the rooftop", fileURL: nil,
                  thumbnailURL: "https://picsum.photos/seed/v1/400/700",
                  duration: "15", status: "ready", createdAt: fixedDate,
                  updatedAt: fixedDate, likeCount: 42, commentCount: 7,
                  liked: false, userName: "alice"),
            Video(id: "v2", userId: "u2", title: "My dog learning to skateboard",
                  description: nil, fileURL: nil,
                  thumbnailURL: "https://picsum.photos/seed/v2/400/700",
                  duration: "30", status: "ready", createdAt: fixedDate,
                  updatedAt: fixedDate, likeCount: 128, commentCount: 23,
                  liked: true, userName: "bob"),
            Video(id: "v3", userId: "u1", title: "New recipe: sourdough bread",
                  description: "Crumb shot included", fileURL: nil,
                  thumbnailURL: "https://picsum.photos/seed/v3/400/700",
                  duration: "60", status: "ready", createdAt: fixedDate,
                  updatedAt: fixedDate, likeCount: 15, commentCount: 3,
                  liked: false, userName: "alice"),
        ]
    }

    func getVideoDetail(id: String) async throws -> Video {
        Video(id: id, userId: "u1", title: "Video Detail \(id)",
              description: "Full description for video \(id)", fileURL: nil,
              thumbnailURL: "https://picsum.photos/seed/\(id)/400/700",
              duration: "30", status: "ready", createdAt: fixedDate,
              updatedAt: fixedDate, likeCount: 42, commentCount: 7,
              liked: false, userName: "alice")
    }

    func createVideo(url: String?, title: String?, description: String?) async throws -> String {
        "stub-video-\(UUID().uuidString)"
    }

    func likeVideo(id: String) async throws {}

    func unlikeVideo(id: String) async throws {}

    func getComments(videoId: String) async throws -> [Comment] {
        [
            Comment(id: "c1", userId: "u2", userName: "bob", videoId: videoId,
                    parentId: nil, body: "Great video!", createdAt: fixedDate),
            Comment(id: "c2", userId: "u3", userName: "charlie", videoId: videoId,
                    parentId: nil, body: "Love this 👏", createdAt: fixedDate),
        ]
    }

    func postComment(videoId: String, body: String, parentId: String?) async throws -> CreateCommentResponse {
        CreateCommentResponse(id: "stub-cmt-\(UUID().uuidString)", createdAt: fixedDate)
    }

    func markWatched(videoId: String, progressSeconds: Int) async throws {}

    func getHistory() async throws -> [WatchHistoryEntry] {
        [
            WatchHistoryEntry(id: "v1", title: "Amazing sunset timelapse",
                              thumbnailURL: "https://picsum.photos/seed/v1/400/700",
                              userName: "alice", watchedAt: fixedDate, progressSeconds: 15),
            WatchHistoryEntry(id: "v2", title: "My dog learning to skateboard",
                              thumbnailURL: "https://picsum.photos/seed/v2/400/700",
                              userName: "bob", watchedAt: fixedDate, progressSeconds: 30),
        ]
    }
}
