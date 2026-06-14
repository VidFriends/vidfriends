import SwiftUI
import Observation

@Observable
final class AppState {
    var isAuthenticated = false
    var currentUser: User?
    var apiConfig = APIConfig()
    var authToken: String? {
        didSet {
            apiConfig.token = authToken
        }
    }

    let keychainService = KeychainService()
    let authService: AuthService
    var apiClient: APIClientProtocol

    init() {
        let config = APIConfig(baseURL: URL(string: "http://localhost:3100")!)
        let keychain = KeychainService()
        let authSvc = AuthService(apiConfig: config, keychainService: keychain)
        authService = authSvc
        apiClient = APIClient(config: config, keychainService: keychain)
        apiConfig = config

        if let token = keychain.loadToken() {
            authToken = token
            apiConfig.token = token
            authSvc.restoreSession(token: token)
        }
    }

    func setEnvironment(baseURL: URL, useStub: Bool) {
        apiConfig = APIConfig(baseURL: baseURL, useStub: useStub, token: apiConfig.token)
        if useStub {
            apiClient = StubAPIClient()
        } else {
            apiClient = APIClient(config: apiConfig, keychainService: keychainService)
        }
    }
}
