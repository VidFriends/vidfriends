import Foundation

protocol APIClientProtocol {
    // Auth
    func register(email: String, username: String, password: String, displayName: String?) async throws -> String
    func registerWithInvite(email: String, username: String, password: String, displayName: String?, inviteCode: String) async throws -> String
    func login(email: String, password: String) async throws -> String
    func refreshToken() async throws -> String

    // Health
    func checkHealth() async throws -> Bool

    // Feed
    func getFeed() async throws -> [Video]

    // Videos
    func getVideoDetail(id: String) async throws -> Video
    func createVideo(url: String?, title: String?, description: String?) async throws -> String
    func likeVideo(id: String) async throws
    func unlikeVideo(id: String) async throws
    func getComments(videoId: String) async throws -> [Comment]
    func postComment(videoId: String, body: String, parentId: String?) async throws -> CreateCommentResponse
    func markWatched(videoId: String, progressSeconds: Int) async throws
    func getHistory() async throws -> [WatchHistoryEntry]

    // Social
    func searchUsers(query: String) async throws -> [UserSearchResult]
    func sendVideo(id: String, toUserId: String) async throws
    func getInbox() async throws -> [InboxItem]
    func updateInboxItem(id: String, status: String) async throws

    // Friends
    func getFriends() async throws -> [Friend]
    func getFriendRequests() async throws -> [Friend]
    func respondToFriendRequest(id: String, accept: Bool) async throws

    // User
    func getCurrentUser() async throws -> User
    func updateProfile(displayName: String?) async throws -> User

    // Collections
    func getCollections() async throws -> [Collection]
    func createCollection(name: String) async throws -> Collection
    func getCollectionVideos(id: String) async throws -> [VideoWithUser]
    func addVideoToCollection(collectionId: String, videoId: String) async throws
    func removeVideoFromCollection(collectionId: String, videoId: String) async throws
    func deleteCollection(id: String) async throws

    // Sent
    func getSentVideos() async throws -> [SentVideo]
    func unsendVideo(id: String) async throws

    // Push
    func registerPushToken(token: String) async throws
    func getPushSettings() async throws -> PushSettings
    func updatePushSettings(notificationsEnabled: Bool) async throws

    // Upload / Download
    func uploadVideo(fileData: Data, fileName: String, progress: (@Sendable (Double) -> Void)?) async throws -> String
    func downloadVideo(id: String) async throws -> VideoDownloadResponse

    // Blocking
    func blockUser(id: String) async throws
    func unblockUser(id: String) async throws
    func getBlockedUsers() async throws -> [BlockedUser]
}
