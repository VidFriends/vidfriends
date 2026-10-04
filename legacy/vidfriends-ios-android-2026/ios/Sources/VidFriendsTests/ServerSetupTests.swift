import Testing
import Foundation
@testable import VidFriends

struct ServerSetupTests {

    // MARK: - URL Sanitization Tests

    @Test("sanitizedURL prepends https when scheme is missing")
    func sanitizedURLAddsHttps() {
        let url = ServerSetupView.sanitizedURL(from: "videos.example.com")
        #expect(url?.absoluteString == "https://videos.example.com")
    }

    @Test("sanitizedURL preserves existing https scheme")
    func sanitizedURLPreservesHttps() {
        let url = ServerSetupView.sanitizedURL(from: "https://videos.example.com")
        #expect(url?.absoluteString == "https://videos.example.com")
    }

    @Test("sanitizedURL preserves existing http scheme")
    func sanitizedURLPreservesHttp() {
        let url = ServerSetupView.sanitizedURL(from: "http://localhost:3100")
        #expect(url?.absoluteString == "http://localhost:3100")
    }

    @Test("sanitizedURL returns nil for empty string")
    func sanitizedURLEmpty() {
        let url = ServerSetupView.sanitizedURL(from: "")
        #expect(url == nil)
    }

    @Test("sanitizedURL returns nil for whitespace-only string")
    func sanitizedURLWhitespace() {
        let url = ServerSetupView.sanitizedURL(from: "   ")
        #expect(url == nil)
    }

    @Test("sanitizedURL trims whitespace and prepends https")
    func sanitizedURLTrimsWhitespace() {
        let url = ServerSetupView.sanitizedURL(from: "  videos.example.com  ")
        #expect(url?.absoluteString == "https://videos.example.com")
    }

    @Test("sanitizedURL handles URL with port")
    func sanitizedURLWithPort() {
        let url = ServerSetupView.sanitizedURL(from: "https://server.local:8443")
        #expect(url?.absoluteString == "https://server.local:8443")
        #expect(url?.port == 8443)
    }

    @Test("sanitizedURL handles IP address URL")
    func sanitizedURLWithIP() {
        let url = ServerSetupView.sanitizedURL(from: "192.168.1.100:8080")
        #expect(url?.absoluteString == "https://192.168.1.100:8080")
    }

    // MARK: - OnboardingCoordinator Flow Tests

    @Test("OnboardingCoordinator transitions to auth after didConnect")
    func coordinatorDidConnectTransition() {
        let coordinator = OnboardingCoordinator()
        let testURL = URL(string: "https://videos.example.com")!

        coordinator.didConnect(to: testURL)

        #expect(coordinator.step == .auth)
        #expect(coordinator.serverURL == testURL)
    }

    @Test("OnboardingCoordinator transitions to biometry after didAuthenticate")
    func coordinatorDidAuthenticateTransition() {
        let coordinator = OnboardingCoordinator()
        coordinator.didConnect(to: URL(string: "https://videos.example.com")!)
        coordinator.didAuthenticate(token: "test-token-123")

        #expect(coordinator.step == .biometryOptIn)
        #expect(coordinator.pendingToken == "test-token-123")
    }

    @Test("OnboardingCoordinator didConnect overwrites previous URL")
    func coordinatorDidConnectOverwritesURL() {
        let coordinator = OnboardingCoordinator()
        let firstURL = URL(string: "https://old.example.com")!
        let secondURL = URL(string: "https://new.example.com")!

        coordinator.didConnect(to: firstURL)
        coordinator.didConnect(to: secondURL)

        #expect(coordinator.serverURL == secondURL)
    }

    // MARK: - AppState / APIConfig Tests

    @Test("AppState setEnvironment switches to real client with given URL")
    func appStateSetEnvironment() {
        let state = AppState()
        let url = URL(string: "https://videos.example.com")!

        state.setEnvironment(baseURL: url, useStub: false)

        #expect(state.apiConfig.baseURL == url)
        #expect(state.apiConfig.useStub == false)
    }

    @Test("AppState setEnvironment switches to stub client")
    func appStateSetEnvironmentStub() {
        let state = AppState()
        let url = URL(string: "https://videos.example.com")!

        state.setEnvironment(baseURL: url, useStub: true)

        #expect(state.apiConfig.useStub == true)
    }

    @Test("APIConfig defaults to localhost:8080")
    func apiConfigDefaultURL() {
        let config = APIConfig()
        #expect(config.baseURL.absoluteString == "http://localhost:8080")
        #expect(config.useStub == false)
    }

    @Test("APIConfig can be initialized with custom URL and token")
    func apiConfigCustomURL() {
        let url = URL(string: "https://videos.example.com")!
        let config = APIConfig(baseURL: url, useStub: false, token: "abc")
        #expect(config.baseURL == url)
        #expect(config.token == "abc")
    }
}
