import Foundation
import KeychainAccess

final class KeychainService {
    private let keychain = Keychain(service: "com.vidflow.app")
        .synchronizable(false)
        .accessibility(.whenUnlockedThisDeviceOnly)

    private let tokenKey = "authToken"
    private let serverURLKey = "serverURL"

    func saveToken(_ token: String) {
        keychain[string: tokenKey] = token
    }

    func loadToken() -> String? {
        keychain[string: tokenKey]
    }

    func clearToken() {
        try? keychain.remove(tokenKey)
    }

    func saveServerURL(_ url: URL) {
        keychain[string: serverURLKey] = url.absoluteString
    }

    func loadServerURL() -> URL? {
        guard let string = keychain[string: serverURLKey] else { return nil }
        return URL(string: string)
    }

    func clearServerURL() {
        try? keychain.remove(serverURLKey)
    }
}
