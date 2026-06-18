import Testing
import Foundation
@testable import VidFriends

struct VidFriendsTests {

    // MARK: - Onboarding / Auth Tests

    @Test("StubAPIClient checkHealth returns true")
    func stubCheckHealth() async throws {
        let client = StubAPIClient()
        let healthy = try await client.checkHealth()
        #expect(healthy == true)
    }

    @Test("StubAPIClient registerWithInvite returns token")
    func stubRegisterWithInvite() async throws {
        let client = StubAPIClient()
        let token = try await client.registerWithInvite(
            email: "test@vidfriends.com",
            username: "testuser",
            password: "password123",
            displayName: "Test User",
            inviteCode: "INVITE-123"
        )
        #expect(token.hasPrefix("stub-token-invite"))
    }

    @Test("Endpoint health path is correct")
    func endpointHealth() {
        #expect(Endpoint.health.path == "/api/health")
        #expect(Endpoint.health.method == "GET")
        #expect(Endpoint.health.requiresAuth == false)
    }

    @Test("Endpoint registerWithInvite is same path as register")
    func endpointRegisterWithInvite() {
        #expect(Endpoint.registerWithInvite.path == "/api/auth/register")
        #expect(Endpoint.registerWithInvite.requiresAuth == false)
    }

    @Test("OnboardingCoordinator starts at serverSetup")
    func onboardingCoordinatorInitialStep() {
        let coordinator = OnboardingCoordinator()
        #expect(coordinator.step == .serverSetup)
        #expect(coordinator.serverURL == nil)
        #expect(coordinator.pendingToken == nil)
    }

    @Test("OnboardingCoordinator transitions through steps")
    func onboardingCoordinatorFlow() {
        let coordinator = OnboardingCoordinator()
        let testURL = URL(string: "https://videos.example.com")!

        coordinator.didConnect(to: testURL)
        #expect(coordinator.step == .auth)
        #expect(coordinator.serverURL == testURL)

        coordinator.didAuthenticate(token: "test-token")
        #expect(coordinator.step == .biometryOptIn)
        #expect(coordinator.pendingToken == "test-token")
    }

    @Test("InviteSignupRequest encodes with invite_code")
    func inviteSignupRequestEncoding() throws {
        let request = InviteSignupRequest(
            email: "test@vidfriends.com",
            username: "testuser",
            password: "secret123",
            displayName: "Test",
            inviteCode: "INVITE-ABC"
        )
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["email"] == "test@vidfriends.com")
        #expect(json?["username"] == "testuser")
        #expect(json?["invite_code"] == "INVITE-ABC")
        #expect(json?["display_name"] == "Test")
    }

    @Test("StubAPIClient returns stub feed")
    func stubFeed() async throws {
        let client = StubAPIClient()
        let feed = try await client.getFeed()
        #expect(feed.count == 3)
        #expect(feed[0].title == "Amazing sunset timelapse")
    }

    @Test("StubAPIClient returns stub comments")
    func stubComments() async throws {
        let client = StubAPIClient()
        let comments = try await client.getComments(videoId: "v1")
        #expect(comments.count == 2)
        #expect(comments[0].userName == "bob")
    }

    @Test("StubAPIClient stub login returns non-empty token")
    func stubLogin() async throws {
        let client = StubAPIClient()
        let token = try await client.login(email: "test@vidfriends.com", password: "password123")
        #expect(token.hasPrefix("stub-token-login"))
    }

    @Test("Video model decodes from JSON")
    func videoDecoding() throws {
        let json = """
        {
            "id": "v1",
            "user_id": "u1",
            "title": "Test Video",
            "status": "ready",
            "created_at": "2026-06-14T00:00:00Z",
            "updated_at": "2026-06-14T00:00:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let video = try decoder.decode(Video.self, from: json)
        #expect(video.id == "v1")
        #expect(video.title == "Test Video")
        #expect(video.status == "ready")
    }

    @Test("User model decodes from JSON")
    func userDecoding() throws {
        let json = """
        {
            "id": "u1",
            "email": "alice@vidfriends.com",
            "username": "alice",
            "role": "user",
            "status": "active",
            "created_at": "2026-06-14T00:00:00Z",
            "updated_at": "2026-06-14T00:00:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let user = try decoder.decode(User.self, from: json)
        #expect(user.email == "alice@vidfriends.com")
        #expect(user.username == "alice")
    }

    @Test("InboxItem model decodes from JSON")
    func inboxItemDecoding() throws {
        let json = """
        {
            "id": "in1",
            "video_id": "v1",
            "from_user_id": "u2",
            "from_user_name": "bob",
            "title": "Check this out!",
            "thumbnail_url": "https://example.com/thumb.jpg",
            "status": "pending",
            "created_at": "2026-06-14T00:00:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let item = try decoder.decode(InboxItem.self, from: json)
        #expect(item.id == "in1")
        #expect(item.fromUserName == "bob")
        #expect(item.title == "Check this out!")
        #expect(item.status == "pending")
    }

    @Test("Friend model decodes from JSON with username")
    func friendDecoding() throws {
        let json = """
        {
            "id": "f1",
            "requester_id": "u1",
            "addressee_id": "u2",
            "status": "accepted",
            "username": "bob",
            "display_name": "Bob Smith",
            "created_at": "2026-06-14T00:00:00Z",
            "updated_at": "2026-06-14T00:00:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let friend = try decoder.decode(Friend.self, from: json)
        #expect(friend.id == "f1")
        #expect(friend.username == "bob")
        #expect(friend.displayName == "Bob Smith")
    }

    @Test("UserSearchResult model decodes from JSON")
    func userSearchResultDecoding() throws {
        let json = """
        {
            "id": "u1",
            "username": "alice",
            "display_name": "Alice Johnson"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let result = try decoder.decode(UserSearchResult.self, from: json)
        #expect(result.id == "u1")
        #expect(result.username == "alice")
        #expect(result.displayName == "Alice Johnson")
    }

    @Test("UserSearchResponse decodes from JSON")
    func userSearchResponseDecoding() throws {
        let json = """
        {
            "users": [
                {"id": "u1", "username": "alice", "display_name": "Alice Johnson"},
                {"id": "u2", "username": "bob", "display_name": null}
            ]
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let response = try decoder.decode(UserSearchResponse.self, from: json)
        #expect(response.users.count == 2)
        #expect(response.users[0].username == "alice")
        #expect(response.users[1].displayName == nil)
    }

    @Test("PushRegisterRequest encodes correctly")
    func pushRegisterRequestEncoding() throws {
        let request = PushRegisterRequest(token: "abc123", platform: "ios")
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["token"] == "abc123")
        #expect(json?["platform"] == "ios")
    }

    @Test("SendVideoRequest encodes correctly")
    func sendVideoRequestEncoding() throws {
        let request = SendVideoRequest(toUserId: "u2")
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["to_user_id"] == "u2")
    }

    // MARK: - Stub Social Methods

    @Test("StubAPIClient searchUsers returns filtered results")
    func stubSearchUsers() async throws {
        let client = StubAPIClient()
        let results = try await client.searchUsers(query: "alice")
        #expect(results.count >= 1)
        #expect(results.first?.username == "alice")
    }

    @Test("StubAPIClient getInbox returns stub items")
    func stubGetInbox() async throws {
        let client = StubAPIClient()
        let inbox = try await client.getInbox()
        #expect(inbox.count == 2)
        #expect(inbox[0].status == "pending")
    }

    @Test("StubAPIClient getFriends returns stub friends with usernames")
    func stubGetFriends() async throws {
        let client = StubAPIClient()
        let friends = try await client.getFriends()
        #expect(friends.count == 2)
        #expect(friends[0].status == "accepted")
        #expect(friends[0].username == "bob")
    }

    @Test("StubAPIClient getCurrentUser returns stub user")
    func stubGetCurrentUser() async throws {
        let client = StubAPIClient()
        let user = try await client.getCurrentUser()
        #expect(user.id == "u1")
        #expect(user.username == "alice")
        #expect(user.email == "alice@vidfriends.com")
    }

    @Test("StubAPIClient uploadVideo calls progress and returns URL")
    func stubUploadVideo() async throws {
        let client = StubAPIClient()
        var progressValues: [Double] = []
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("test-upload-\(UUID().uuidString).mp4")
        try Data([0, 1, 2]).write(to: tempURL)
        defer { try? FileManager.default.removeItem(at: tempURL) }
        let url = try await client.uploadVideo(
            fileURL: tempURL,
            fileName: "test.mp4",
            progress: { progressValues.append($0) }
        )
        #expect(url.hasPrefix("stub-upload-url"))
        #expect(progressValues.isEmpty == false)
        #expect(progressValues.last == 1.0)
    }

    // MARK: - Collection Tests

    @Test("Collection model decodes from JSON")
    func collectionDecoding() throws {
        let json = """
        {
            "id": "c1",
            "user_id": "u1",
            "name": "Watch Later",
            "video_count": 3,
            "created_at": "2026-06-14T00:00:00Z",
            "updated_at": "2026-06-14T00:00:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let collection = try decoder.decode(Collection.self, from: json)
        #expect(collection.id == "c1")
        #expect(collection.name == "Watch Later")
        #expect(collection.videoCount == 3)
    }

    @Test("CreateCollectionRequest encodes correctly")
    func createCollectionRequestEncoding() throws {
        let request = CreateCollectionRequest(name: "Favorites")
        let encoder = JSONEncoder()
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["name"] == "Favorites")
    }

    @Test("UpdateProfileRequest encodes correctly")
    func updateProfileRequestEncoding() throws {
        let request = UpdateProfileRequest(displayName: "New Name")
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["display_name"] == "New Name")
    }

    @Test("StubAPIClient collections returns stub data")
    func stubGetCollections() async throws {
        let client = StubAPIClient()
        let collections = try await client.getCollections()
        #expect(collections.count == 3)
        #expect(collections[0].name == "Watch Later")
    }

    @Test("StubAPIClient createCollection returns new collection")
    func stubCreateCollection() async throws {
        let client = StubAPIClient()
        let collection = try await client.createCollection(name: "Test")
        #expect(collection.name == "Test")
        #expect(collection.videoCount == 0)
    }

    @Test("StubAPIClient getSentVideos returns stub data")
    func stubGetSentVideos() async throws {
        let client = StubAPIClient()
        let sent = try await client.getSentVideos()
        #expect(sent.count == 2)
        #expect(sent[0].recipientName == "bob")
    }

    @Test("StubAPIClient updateProfile returns updated user")
    func stubUpdateProfile() async throws {
        let client = StubAPIClient()
        let user = try await client.updateProfile(displayName: "Alice Updated")
        #expect(user.displayName == "Alice Updated")
    }

    // MARK: - Blocking Tests

    @Test("StubAPIClient blockUser succeeds")
    func stubBlockUser() async throws {
        let client = StubAPIClient()
        try await client.blockUser(id: "u2")
    }

    @Test("StubAPIClient unblockUser succeeds")
    func stubUnblockUser() async throws {
        let client = StubAPIClient()
        try await client.unblockUser(id: "u2")
    }

    @Test("StubAPIClient getBlockedUsers returns stub data")
    func stubGetBlockedUsers() async throws {
        let client = StubAPIClient()
        let blocked = try await client.getBlockedUsers()
        #expect(blocked.count == 1)
        #expect(blocked[0].username == "dave")
    }

    @Test("BlockedUser model decodes from JSON")
    func blockedUserDecoding() throws {
        let json = """
        {
            "id": "u4",
            "username": "dave",
            "display_name": "Dave D.",
            "blocked_at": "2026-06-14T00:00:00Z"
        }
        """.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let user = try decoder.decode(BlockedUser.self, from: json)
        #expect(user.id == "u4")
        #expect(user.username == "dave")
        #expect(user.displayName == "Dave D.")
    }

    @Test("Blocking endpoints have correct paths")
    func endpointBlocking() {
        #expect(Endpoint.blockUser(id: "u2").path == "/api/users/u2/block")
        #expect(Endpoint.blockUser(id: "u2").method == "POST")
        #expect(Endpoint.unblockUser(id: "u2").path == "/api/users/u2/block")
        #expect(Endpoint.unblockUser(id: "u2").method == "DELETE")
        #expect(Endpoint.blockedUsers.path == "/api/users/blocked")
        #expect(Endpoint.blockedUsers.method == "GET")
    }

    // MARK: - Unsend Tests

    @Test("StubAPIClient unsendVideo succeeds")
    func stubUnsendVideo() async throws {
        let client = StubAPIClient()
        try await client.unsendVideo(id: "s1")
    }

    @Test("Unsend endpoint has correct path and method")
    func endpointUnsend() {
        #expect(Endpoint.unsendVideo(id: "s1").path == "/api/videos/s1/unsend")
        #expect(Endpoint.unsendVideo(id: "s1").method == "POST")
        #expect(Endpoint.unsendVideo(id: "s1").requiresAuth == true)
    }

    // MARK: - Offline / Push Tests

    @Test("PushRegisterRequest has platform field")
    func pushRegisterRequestPlatform() throws {
        let request = PushRegisterRequest(token: "abc", platform: "ios")
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["platform"] == "ios")
    }

    @Test("Push settings endpoints have correct paths")
    func endpointPushSettings() {
        #expect(Endpoint.pushSettings.path == "/api/push/settings")
        #expect(Endpoint.registerPushToken.path == "/api/push/register")
    }

    @Test("OfflineOperationQueue enqueue and dequeue")
    func offlineQueueEnqueueDequeue() async {
        let queue = OfflineOperationQueue()
        await queue.enqueue(.likeVideo(id: "v1"))
        await queue.enqueue(.blockUser(id: "u2"))
        let count = await queue.count
        #expect(count == 2)
        let first = await queue.peek().first
        #expect(first != nil)
        if let first {
            await queue.remove(id: first.id)
        }
        let remaining = await queue.count
        #expect(remaining == 1)
    }

    @Test("NetworkMonitorService initializes with connected")
    func networkMonitorInitialState() {
        let monitor = NetworkMonitorService()
        #expect(monitor.isConnected == true)
    }

    // MARK: - Download / Offline Video Tests

    @Test("Endpoint videoDownload has correct path and method")
    func endpointVideoDownload() {
        let endpoint = Endpoint.videoDownload(id: "v-test-1")
        #expect(endpoint.path == "/api/videos/v-test-1/download")
        #expect(endpoint.method == "GET")
        #expect(endpoint.requiresAuth == true)
    }

    @Test("DownloadedVideo model stores videoId as unique")
    func downloadedVideoModel() {
        let video = DownloadedVideo(
            videoId: "v1",
            title: "Test Video",
            fileName: "test.mp4",
            localFileURL: "/path/to/test.mp4",
            thumbnailURL: "https://example.com/thumb.jpg",
            duration: "00:30",
            fileSize: 1_024_000
        )
        #expect(video.videoId == "v1")
        #expect(video.title == "Test Video")
        #expect(video.fileName == "test.mp4")
        #expect(video.localFileURL == "/path/to/test.mp4")
        #expect(video.thumbnailURL == "https://example.com/thumb.jpg")
        #expect(video.duration == "00:30")
        #expect(video.fileSize == 1_024_000)
    }

    @Test("DownloadedVideo defaults to now for downloadedAt")
    func downloadedVideoDefaultDate() {
        let video = DownloadedVideo(
            videoId: "v2",
            title: "Default Date",
            fileName: "v2.mp4",
            localFileURL: "/tmp/v2.mp4"
        )
        #expect(video.downloadedAt.timeIntervalSinceNow < 1)
    }

    @Test("StubAPIClient downloadVideo returns valid response")
    func stubDownloadVideo() async throws {
        let client = StubAPIClient()
        let response = try await client.downloadVideo(id: "v-dl-1")
        #expect(response.url.hasPrefix("stub-download-url"))
        #expect(response.fileName == "video-v-dl-1.mp4")
    }

    @Test("VideoDownloadResponse decodes with snake_case")
    func videoDownloadResponseDecoding() throws {
        let json = """
        {
            "url": "https://cdn.example.com/video.mp4",
            "file_name": "sunset.mp4"
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let response = try decoder.decode(VideoDownloadResponse.self, from: json)
        #expect(response.url == "https://cdn.example.com/video.mp4")
        #expect(response.fileName == "sunset.mp4")
    }

    @Test("DownloadService initializes")
    func downloadServiceInit() {
        let client = StubAPIClient()
        let context = try! ModelContainer(for: DownloadedVideo.self).mainContext
        let service = DownloadService(apiClient: client, modelContext: context)
        #expect(service.downloadedVideos().isEmpty)
    }

    @Test("DownloadService videoSizeString formats correctly")
    func downloadServiceVideoSizeString() {
        let client = StubAPIClient()
        let context = try! ModelContainer(for: DownloadedVideo.self).mainContext
        let service = DownloadService(apiClient: client, modelContext: context)
        let video = DownloadedVideo(
            videoId: "v-size",
            title: "Size Test",
            fileName: "size.mp4",
            localFileURL: "/tmp/size.mp4",
            fileSize: 5_242_880
        )
        let sizeStr = service.videoSizeString(video)
        #expect(sizeStr.hasPrefix("5"))
    }

    @Test("DownloadError has description")
    func downloadErrorDescription() {
        #expect(DownloadError.invalidDownloadURL.errorDescription != nil)
    }

    // MARK: - FYP Feed Tests

    @Test("FeedResponse decodes with videos and optional cursor")
    func feedResponseDecoding() throws {
        let json = """
        {
            "videos": [
                {"id": "v1", "user_id": "u1", "title": "Test", "status": "ready", "created_at": "2026-06-14T00:00:00Z", "updated_at": "2026-06-14T00:00:00Z"}
            ],
            "next_cursor": "cursor-abc"
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let response = try decoder.decode(FeedResponse.self, from: json)
        #expect(response.videos.count == 1)
        #expect(response.videos[0].id == "v1")
        #expect(response.nextCursor == "cursor-abc")
    }

    @Test("FeedResponse decodes with nil cursor at end")
    func feedResponseDecodingNoCursor() throws {
        let json = """
        {
            "videos": [],
            "next_cursor": null
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let response = try decoder.decode(FeedResponse.self, from: json)
        #expect(response.videos.isEmpty)
        #expect(response.nextCursor == nil)
    }

    @Test("StubAPIClient getPaginatedFeed returns feed with nil cursor")
    func stubPaginatedFeed() async throws {
        let client = StubAPIClient()
        let response = try await client.getPaginatedFeed(cursor: nil)
        #expect(response.videos.count == 3)
        #expect(response.nextCursor == nil)
    }

    @Test("StubAPIClient getPaginatedFeed with cursor still returns full stub")
    func stubPaginatedFeedWithCursor() async throws {
        let client = StubAPIClient()
        let response = try await client.getPaginatedFeed(cursor: "some-cursor")
        #expect(response.videos.count == 3)
        #expect(response.nextCursor == nil)
    }

    @Test("Comment model decodes from JSON with full fields")
    func commentDecoding() throws {
        let json = """
        {
            "id": "c1",
            "user_id": "u2",
            "user_name": "bob",
            "video_id": "v1",
            "parent_id": null,
            "body": "Great video!",
            "created_at": "2026-06-14T00:00:00Z"
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let comment = try decoder.decode(Comment.self, from: json)
        #expect(comment.id == "c1")
        #expect(comment.userName == "bob")
        #expect(comment.body == "Great video!")
        #expect(comment.parentId == nil)
    }

    @Test("CreateCommentResponse decodes from JSON")
    func createCommentResponseDecoding() throws {
        let json = """
        {
            "id": "c-new",
            "created_at": "2026-06-14T00:00:00Z"
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let response = try decoder.decode(CreateCommentResponse.self, from: json)
        #expect(response.id == "c-new")
        #expect(response.createdAt == "2026-06-14T00:00:00Z")
    }

    @Test("StubAPIClient postComment returns valid response")
    func stubPostComment() async throws {
        let client = StubAPIClient()
        let response = try await client.postComment(videoId: "v1", body: "Nice!", parentId: nil)
        #expect(response.id.hasPrefix("stub-cmt-"))
        #expect(response.createdAt.isEmpty == false)
    }

    @Test("CreateCommentRequest encodes with optional parent_id")
    func createCommentRequestEncoding() throws {
        let request = CreateCommentRequest(body: "Nice video!", parentId: nil)
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["body"] == "Nice video!")
        #expect(json?["parent_id"] == nil)
    }

    @Test("CreateCommentRequest encodes with parent_id")
    func createCommentRequestWithParentEncoding() throws {
        let request = CreateCommentRequest(body: "Reply!", parentId: "c1")
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["body"] == "Reply!")
        #expect(json?["parent_id"] == "c1")
    }

    @Test("Comment endpoints have correct paths")
    func endpointComments() {
        #expect(Endpoint.videoComments(id: "v1").path == "/api/videos/v1/comments")
        #expect(Endpoint.videoComments(id: "v1").method == "GET")
        #expect(Endpoint.commentOnVideo(id: "v1").path == "/api/videos/v1/comment")
        #expect(Endpoint.commentOnVideo(id: "v1").method == "POST")
    }
}
