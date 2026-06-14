import Foundation

actor AuthInterceptor {
    private let apiClient: APIClient
    private let keychainService: KeychainService
    private var isRefreshing = false

    init(apiClient: APIClient, keychainService: KeychainService) {
        self.apiClient = apiClient
        self.keychainService = keychainService
    }

    func intercept<T>(_ operation: () async throws -> T) async throws -> T {
        do {
            return try await operation()
        } catch APIError.unauthorized {
            return try await handleUnauthorized(operation)
        }
    }

    private func handleUnauthorized<T>(_ operation: () async throws -> T) async throws -> T {
        if isRefreshing {
            throw APIError.tokenExpired
        }

        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let newToken = try await apiClient.refreshToken()
            keychainService.saveToken(newToken)
            return try await operation()
        } catch {
            keychainService.clearToken()
            throw APIError.refreshFailed
        }
    }
}
