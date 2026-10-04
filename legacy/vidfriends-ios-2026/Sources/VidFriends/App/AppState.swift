import SwiftUI
import Observation
import SwiftData

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
    var blockedUserIds: Set<String> = []

    let keychainService = KeychainService(useAppGroup: true)
    let authService: AuthService
    let networkMonitor = NetworkMonitorService()
    var apiClient: APIClientProtocol
    let pushService = PushNotificationService()
    var offlineService: OfflineService?
    var downloadService: DownloadService!
    private var modelContext: ModelContext?

    init() {
        let config = APIConfig(baseURL: URL(string: "http://localhost:3100")!)
        let keychain = KeychainService(useAppGroup: true)
        let authSvc = AuthService(apiConfig: config, keychainService: keychain)
        authService = authSvc
        let client = APIClient(config: config, keychainService: keychain)
        apiClient = client
        apiConfig = config

        if let token = keychain.loadToken() {
            authToken = token
            apiConfig.token = token
            authSvc.restoreSession(token: token)
            isAuthenticated = true
        }

        Task {
            let interceptor = AuthInterceptor(apiClient: client, keychainService: keychain)
            await client.setInterceptor(interceptor)

            if authToken != nil {
                try? await authSvc.fetchCurrentUser(using: apiClient)
                currentUser = authSvc.currentUser
            }
        }
    }

    func configureOfflineService(with context: ModelContext) {
        modelContext = context
        offlineService = OfflineService(modelContext: context)
        downloadService = DownloadService(apiClient: apiClient, modelContext: context)
    }

    func completeAuth(token: String) async throws {
        try await authService.handleAuthResponse(token: token)
        authToken = token
        isAuthenticated = true
        try await authService.fetchCurrentUser(using: apiClient)
        currentUser = authService.currentUser
    }

    func logout() {
        authService.logout()
        authToken = nil
        currentUser = nil
        isAuthenticated = false
    }

    func setEnvironment(baseURL: URL, useStub: Bool) {
        apiConfig = APIConfig(baseURL: baseURL, useStub: useStub, token: apiConfig.token)
        if useStub {
            apiClient = StubAPIClient()
        } else {
            let client = APIClient(config: apiConfig, keychainService: keychainService)
            apiClient = client
            Task {
                let interceptor = AuthInterceptor(apiClient: client, keychainService: keychainService)
                await client.setInterceptor(interceptor)
            }
        }
        if let context = modelContext {
            downloadService = DownloadService(apiClient: apiClient, modelContext: context)
        }
    }

    func loadBlockedUserIds() async {
        do {
            let blocked = try await apiClient.getBlockedUsers()
            blockedUserIds = Set(blocked.map { $0.id })
        } catch {
            blockedUserIds = []
        }
    }
}
