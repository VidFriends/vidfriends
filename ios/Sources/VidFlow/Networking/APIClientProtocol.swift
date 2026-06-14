import Foundation

protocol APIClientProtocol {
    // Auth
    func register(email: String, username: String, password: String, displayName: String?) async throws -> String
    func login(email: String, password: String) async throws -> String
    func refreshToken() async throws -> String

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
}
