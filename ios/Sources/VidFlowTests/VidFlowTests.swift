import Testing
import Foundation
@testable import VidFlow

struct VidFlowTests {

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
}
