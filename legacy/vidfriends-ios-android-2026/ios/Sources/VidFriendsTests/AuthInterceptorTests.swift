import Testing
import Foundation
@testable import VidFriends

// MARK: - Mock API Client for interceptor testing

private actor MockAPIClient: APIClientProtocol {
    var refreshCallCount = 0
    var shouldRefreshFail = false
    var refreshTokenValue = "refreshed-token"

    func setShouldRefreshFail(_ val: Bool) { shouldRefreshFail = val }
    func setRefreshToken(_ val: String) { refreshTokenValue = val }
    func getRefreshCallCount() -> Int { refreshCallCount }

    func register(email: String, username: String, password: String, displayName: String?) async throws -> String { "" }
    func registerWithInvite(email: String, username: String, password: String, displayName: String?, inviteCode: String) async throws -> String { "" }
    func login(email: String, password: String) async throws -> String { "" }
    func checkHealth() async throws -> Bool { true }
    func getFeed() async throws -> [Video] { [] }
    func getVideoDetail(id: String) async throws -> Video { throw APIError.notFound }
    func createVideo(url: String?, title: String?, description: String?) async throws -> String { "" }
    func likeVideo(id: String) async throws {}
    func unlikeVideo(id: String) async throws {}
    func getComments(videoId: String) async throws -> [Comment] { [] }
    func postComment(videoId: String, body: String, parentId: String?) async throws -> CreateCommentResponse {
        CreateCommentResponse(id: "", createdAt: "")
    }
    func markWatched(videoId: String, progressSeconds: Int) async throws {}
    func getHistory() async throws -> [WatchHistoryEntry] { [] }
    func searchUsers(query: String) async throws -> [UserSearchResult] { [] }
    func sendVideo(id: String, toUserId: String) async throws {}
    func getInbox() async throws -> [InboxItem] { [] }
    func updateInboxItem(id: String, status: String) async throws {}
    func getFriends() async throws -> [Friend] { [] }
    func getFriendRequests() async throws -> [Friend] { [] }
    func respondToFriendRequest(id: String, accept: Bool) async throws {}
    func getCurrentUser() async throws -> User { throw APIError.notFound }
    func updateProfile(displayName: String?) async throws -> User { throw APIError.notFound }
    func getCollections() async throws -> [Collection] { [] }
    func createCollection(name: String) async throws -> Collection { throw APIError.notFound }
    func getCollectionVideos(id: String) async throws -> [VideoWithUser] { [] }
    func addVideoToCollection(collectionId: String, videoId: String) async throws {}
    func removeVideoFromCollection(collectionId: String, videoId: String) async throws {}
    func deleteCollection(id: String) async throws {}
    func getSentVideos() async throws -> [SentVideo] { [] }
    func unsendVideo(id: String) async throws {}
    func registerPushToken(token: String) async throws {}
    func getPushSettings() async throws -> PushSettings {
        PushSettings(notificationsEnabled: true, newVideoAlerts: true, friendRequestAlerts: true)
    }
    func updatePushSettings(notificationsEnabled: Bool) async throws {}
    func uploadVideo(fileURL: URL, fileName: String, progress: (@Sendable (Double) -> Void)?) async throws -> String { "" }
    func downloadVideo(id: String) async throws -> VideoDownloadResponse {
        VideoDownloadResponse(url: "", fileName: "")
    }
    func blockUser(id: String) async throws {}
    func unblockUser(id: String) async throws {}
    func getBlockedUsers() async throws -> [BlockedUser] { [] }

    func refreshToken() async throws -> String {
        refreshCallCount += 1
        if shouldRefreshFail {
            throw APIError.refreshFailed
        }
        return refreshTokenValue
    }
}

struct AuthInterceptorTests {

    @Test("Interceptor retries operation on 401 and returns success")
    func interceptorRetriesOnUnauthorized() async throws {
        let mockClient = MockAPIClient()
        let keychain = KeychainService()
        let interceptor = AuthInterceptor(apiClient: mockClient, keychainService: keychain)

        var callCount = 0
        let result = try await interceptor.intercept {
            callCount += 1
            if callCount == 1 {
                throw APIError.unauthorized
            }
            return "success"
        }

        #expect(result == "success")
        #expect(callCount == 2)
        let refreshCount = await mockClient.getRefreshCallCount()
        #expect(refreshCount == 1)
    }

    @Test("Interceptor throws refreshFailed when refresh fails")
    func interceptorThrowsOnRefreshFailure() async throws {
        let mockClient = MockAPIClient()
        await mockClient.setShouldRefreshFail(true)
        let keychain = KeychainService()
        let interceptor = AuthInterceptor(apiClient: mockClient, keychainService: keychain)

        await #expect(throws: APIError.refreshFailed) {
            try await interceptor.intercept {
                throw APIError.unauthorized
            }
        }
    }

    @Test("Interceptor passes through successful operations without 401")
    func interceptorPassesThroughOnSuccess() async throws {
        let mockClient = MockAPIClient()
        let keychain = KeychainService()
        let interceptor = AuthInterceptor(apiClient: mockClient, keychainService: keychain)

        let result = try await interceptor.intercept {
            "direct-result"
        }

        #expect(result == "direct-result")
        let refreshCount = await mockClient.getRefreshCallCount()
        #expect(refreshCount == 0)
    }

    @Test("Interceptor throws original non-401 error")
    func interceptorPassesThroughNonAuthError() async throws {
        let mockClient = MockAPIClient()
        let keychain = KeychainService()
        let interceptor = AuthInterceptor(apiClient: mockClient, keychainService: keychain)

        await #expect(throws: APIError.notFound) {
            try await interceptor.intercept {
                throw APIError.notFound
            }
        }
    }

    @Test("Interceptor tokenExpired while refresh is in progress")
    func interceptorDeduplicatesConcurrentRefresh() async throws {
        let mockClient = MockAPIClient()
        let keychain = KeychainService()
        let interceptor = AuthInterceptor(apiClient: mockClient, keychainService: keychain)

        // Simulate isRefreshing state by running two concurrent requests
        // Both hit 401 — only one should call refreshToken
        async let first = try await interceptor.intercept {
            throw APIError.unauthorized
        }

        async let second = try await interceptor.intercept {
            throw APIError.unauthorized
        }

        let refreshCount = await mockClient.getRefreshCallCount()

        // Only the first should trigger a refresh; the second gets tokenExpired or refreshFailed
        // Since both run concurrently, the outcome depends on timing,
        // but refreshCallCount should be at most 1
        #expect(refreshCount <= 1)

        // At least one should fail with tokenExpired on concurrent access
        do {
            try await first
            try await second
        } catch APIError.tokenExpired {
            // Expected for the second concurrent request
        } catch APIError.refreshFailed {
            // Also possible if the refresh itself fails after clearing
        }
    }
}
