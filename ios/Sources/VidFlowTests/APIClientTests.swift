import Testing
import Foundation
@testable import VidFlow

struct APIClientTests {

    @Test("Endpoint path for login")
    func endpointLoginPath() {
        #expect(Endpoint.login.path == "/api/auth/login")
        #expect(Endpoint.login.method == "POST")
        #expect(Endpoint.login.requiresAuth == false)
    }

    @Test("Endpoint path for feed")
    func endpointFeedPath() {
        #expect(Endpoint.feed.path == "/api/feed")
        #expect(Endpoint.feed.method == "GET")
        #expect(Endpoint.feed.requiresAuth == true)
    }

    @Test("Endpoint path for video detail")
    func endpointVideoDetailPath() {
        #expect(Endpoint.videoDetail(id: "abc-123").path == "/api/videos/abc-123")
        #expect(Endpoint.videoDetail(id: "abc-123").method == "GET")
    }

    @Test("Endpoint path for like/unlike")
    func endpointLikeUnlikePath() {
        #expect(Endpoint.likeVideo(id: "v1").path == "/api/videos/v1/like")
        #expect(Endpoint.likeVideo(id: "v1").method == "POST")
        #expect(Endpoint.unlikeVideo(id: "v1").path == "/api/videos/v1/like")
        #expect(Endpoint.unlikeVideo(id: "v1").method == "DELETE")
    }

    @Test("APIError descriptions are non-empty")
    func apiErrorDescriptions() {
        #expect(APIError.unauthorized.errorDescription?.isEmpty == false)
        #expect(APIError.notFound.errorDescription?.isEmpty == false)
        #expect(APIError.invalidURL.errorDescription?.isEmpty == false)
        #expect(APIError.tokenExpired.errorDescription?.isEmpty == false)
    }
}
