import SwiftUI

@Observable
final class OnboardingCoordinator {
    enum Step {
        case serverSetup
        case auth
        case biometryOptIn
    }

    var step: Step = .serverSetup
    var serverURL: URL?
    var pendingToken: String?

    private let keychainService: KeychainService

    init(keychainService: KeychainService = .init()) {
        self.keychainService = keychainService
        if let savedURL = keychainService.loadServerURL() {
            serverURL = savedURL
            step = .auth
        }
    }

    func didConnect(to url: URL) {
        serverURL = url
        keychainService.saveServerURL(url)
        step = .auth
    }

    func didAuthenticate(token: String) {
        pendingToken = token
        step = .biometryOptIn
    }
}
