import Foundation

final class StubAPIClient: APIClientProtocol {
    private let fixedDate = "2026-06-14T00:00:00Z"

    func register(email: String, username: String, password: String, displayName: String?) async throws -> String {
        "stub-token-register-\(UUID().uuidString)"
    }

    func registerWithInvite(email: String, username: String, password: String, displayName: String?, inviteCode: String) async throws -> String {
        "stub-token-invite-\(UUID().uuidString)"
    }

    func login(email: String, password: String) async throws -> String {
        "stub-token-login-\(UUID().uuidString)"
    }

    func refreshToken() async throws -> String {
        "stub-token-refreshed-\(UUID().uuidString)"
    }

    func checkHealth() async throws -> Bool { true }

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

    // MARK: - Social

    func searchUsers(query: String) async throws -> [UserSearchResult] {
        [
            UserSearchResult(id: "u1", username: "alice", displayName: "Alice Johnson"),
            UserSearchResult(id: "u2", username: "bob", displayName: "Bob Smith"),
            UserSearchResult(id: "u3", username: "charlie", displayName: nil),
        ].filter { $0.username.contains(query.lowercased()) || ($0.displayName?.lowercased().contains(query.lowercased()) ?? false) }
    }

    func sendVideo(id: String, toUserId: String) async throws {}

    func getInbox() async throws -> [InboxItem] {
        [
            InboxItem(id: "in1", videoId: "v1", fromUserId: "u2", fromUserName: "bob",
                      title: "Check out this cool clip!", thumbnailURL: "https://picsum.photos/seed/in1/400/700",
                      status: "pending", createdAt: fixedDate),
            InboxItem(id: "in2", videoId: "v2", fromUserId: "u3", fromUserName: "charlie",
                      title: "Funny cat video", thumbnailURL: "https://picsum.photos/seed/in2/400/700",
                      status: "pending", createdAt: fixedDate),
        ]
    }

    func updateInboxItem(id: String, status: String) async throws {}

    // MARK: - Friends

    func getFriends() async throws -> [Friend] {
        [
            Friend(id: "f1", requesterId: "u1", addresseeId: "u2", status: "accepted", username: "bob", displayName: "Bob Smith", createdAt: fixedDate, updatedAt: fixedDate),
            Friend(id: "f2", requesterId: "u1", addresseeId: "u3", status: "accepted", username: "charlie", displayName: nil, createdAt: fixedDate, updatedAt: fixedDate),
        ]
    }

    func getFriendRequests() async throws -> [Friend] {
        [
            Friend(id: "f3", requesterId: "u4", addresseeId: "u1", status: "pending", createdAt: fixedDate, updatedAt: fixedDate),
        ]
    }

    func respondToFriendRequest(id: String, accept: Bool) async throws {}

    // MARK: - User

    func getCurrentUser() async throws -> User {
        User(
            id: "u1",
            email: "alice@vidflow.com",
            username: "alice",
            displayName: "Alice Johnson",
            avatarURL: nil,
            role: "user",
            status: "active",
            storageUsed: nil,
            lastActiveAt: nil,
            createdAt: fixedDate,
            updatedAt: fixedDate
        )
    }

    func updateProfile(displayName: String?) async throws -> User {
        User(
            id: "u1",
            email: "alice@vidflow.com",
            username: "alice",
            displayName: displayName ?? "Alice Johnson",
            avatarURL: nil,
            role: "user",
            status: "active",
            storageUsed: nil,
            lastActiveAt: nil,
            createdAt: fixedDate,
            updatedAt: fixedDate
        )
    }

    // MARK: - Collections

    func getCollections() async throws -> [Collection] {
        [
            Collection(id: "c1", userId: "u1", name: "Watch Later", videoCount: 3,
                       createdAt: fixedDate, updatedAt: fixedDate),
            Collection(id: "c2", userId: "u1", name: "Favorites", videoCount: 5,
                       createdAt: fixedDate, updatedAt: fixedDate),
            Collection(id: "c3", userId: "u1", name: "Travel", videoCount: 2,
                       createdAt: fixedDate, updatedAt: fixedDate),
        ]
    }

    func createCollection(name: String) async throws -> Collection {
        Collection(id: "c-new", userId: "u1", name: name, videoCount: 0,
                   createdAt: fixedDate, updatedAt: fixedDate)
    }

    func getCollectionVideos(id: String) async throws -> [VideoWithUser] {
        [
            VideoWithUser(id: "v1", userId: "u2", title: "Amazing sunset timelapse",
                          description: "Shot this from the rooftop", fileURL: nil,
                          thumbnailURL: "https://picsum.photos/seed/v1/400/700",
                          duration: "15", status: "ready", createdAt: fixedDate,
                          updatedAt: fixedDate, userName: "alice"),
            VideoWithUser(id: "v2", userId: "u2", title: "My dog learning to skateboard",
                          description: nil, fileURL: nil,
                          thumbnailURL: "https://picsum.photos/seed/v2/400/700",
                          duration: "30", status: "ready", createdAt: fixedDate,
                          updatedAt: fixedDate, userName: "bob"),
        ]
    }

    func addVideoToCollection(collectionId: String, videoId: String) async throws {}

    func removeVideoFromCollection(collectionId: String, videoId: String) async throws {}

    func deleteCollection(id: String) async throws {}

    // MARK: - Sent

    func getSentVideos() async throws -> [SentVideo] {
        [
            SentVideo(id: "s1", videoId: "v1", recipientId: "u2", recipientName: "bob",
                      title: "Amazing sunset timelapse",
                      thumbnailURL: "https://picsum.photos/seed/v1/400/700",
                      createdAt: fixedDate),
            SentVideo(id: "s2", videoId: "v3", recipientId: "u3", recipientName: "charlie",
                      title: "New recipe: sourdough bread",
                      thumbnailURL: "https://picsum.photos/seed/v3/400/700",
                      createdAt: fixedDate),
        ]
    }

    // MARK: - Sent

    func unsendVideo(id: String) async throws {}

    // MARK: - Push

    func registerPushToken(token: String) async throws {}

    func getPushSettings() async throws -> PushSettings {
        PushSettings(notificationsEnabled: true, newVideoAlerts: true, friendRequestAlerts: true)
    }

    func updatePushSettings(notificationsEnabled: Bool) async throws {}

    // MARK: - Upload / Download

    func downloadVideo(id: String) async throws -> VideoDownloadResponse {
        VideoDownloadResponse(url: "stub-download-url-\(id)", fileName: "video-\(id).mp4")
    }

    // MARK: - Blocking

    func blockUser(id: String) async throws {}

    func unblockUser(id: String) async throws {}

    func getBlockedUsers() async throws -> [BlockedUser] {
        [
            BlockedUser(id: "u4", username: "dave", displayName: nil, blockedAt: fixedDate),
        ]
    }

    func uploadVideo(fileData: Data, fileName: String, progress: (@Sendable (Double) -> Void)?) async throws -> String {
        progress?(0.3)
        try await Task.sleep(nanoseconds: 100_000_000)
        progress?(0.7)
        try await Task.sleep(nanoseconds: 100_000_000)
        progress?(1.0)
        return "stub-upload-url-\(UUID().uuidString)"
    }
}
