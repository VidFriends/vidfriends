import Foundation
import KeychainAccess

final class KeychainService {
    private let keychain = Keychain(service: "com.vidflow.app")
        .synchronizable(false)
        .accessibility(.whenUnlockedThisDeviceOnly)

    private let tokenKey = "authToken"

    func saveToken(_ token: String) {
        keychain[string: tokenKey] = token
    }

    func loadToken() -> String? {
        keychain[string: tokenKey]
    }

    func clearToken() {
        try? keychain.remove(tokenKey)
    }
}
