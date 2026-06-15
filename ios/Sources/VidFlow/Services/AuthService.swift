import Foundation

@Observable
final class AuthService {
    private let apiConfig: APIConfig
    private let keychainService: KeychainService
    var currentUser: User?
    var isAuthenticated = false

    init(apiConfig: APIConfig, keychainService: KeychainService) {
        self.apiConfig = apiConfig
        self.keychainService = keychainService
    }

    func restoreSession(token: String) {
        keychainService.saveToken(token)
        apiConfig.token = token
        isAuthenticated = true
    }

    func handleAuthResponse(token: String) async throws {
        keychainService.saveToken(token)
        apiConfig.token = token
        isAuthenticated = true
    }

    func fetchCurrentUser(using apiClient: APIClientProtocol) async throws {
        let user = try await apiClient.getCurrentUser()
        currentUser = user
    }

    func logout() {
        keychainService.clearToken()
        apiConfig.token = nil
        currentUser = nil
        isAuthenticated = false
    }
}
