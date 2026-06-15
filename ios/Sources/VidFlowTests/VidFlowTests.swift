import Testing
import Foundation
@testable import VidFlow

struct VidFlowTests {

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
            email: "test@vidflow.com",
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
            email: "test@vidflow.com",
            username: "testuser",
            password: "secret123",
            displayName: "Test",
            inviteCode: "INVITE-ABC"
        )
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: String]
        #expect(json?["email"] == "test@vidflow.com")
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
        let token = try await client.login(email: "test@vidflow.com", password: "password123")
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
            "email": "alice@vidflow.com",
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
        #expect(user.email == "alice@vidflow.com")
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
        #expect(user.email == "alice@vidflow.com")
    }

    @Test("StubAPIClient uploadVideo calls progress and returns URL")
    func stubUploadVideo() async throws {
        let client = StubAPIClient()
        var progressValues: [Double] = []
        let url = try await client.uploadVideo(
            fileData: Data([0, 1, 2]),
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
}
