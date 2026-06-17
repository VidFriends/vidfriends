import Foundation
import KeychainAccess

final class KeychainService {
    private let keychain: Keychain
    private let sharedDefaults: UserDefaults?

    private let tokenKey = "authToken"
    private let serverURLKey = "serverURL"
    private let appGroupID = "group.com.vidfriends.app"
    private let keychainAccessGroup = "com.vidfriends.app"

    init(useAppGroup: Bool = false) {
        if useAppGroup {
            keychain = Keychain(service: "com.vidfriends.app", accessGroup: keychainAccessGroup)
                .synchronizable(false)
                .accessibility(.whenUnlockedThisDeviceOnly)
            sharedDefaults = UserDefaults(suiteName: appGroupID)
        } else {
            keychain = Keychain(service: "com.vidfriends.app")
                .synchronizable(false)
                .accessibility(.whenUnlockedThisDeviceOnly)
            sharedDefaults = nil
        }
    }

    func saveToken(_ token: String) {
        keychain[string: tokenKey] = token
        sharedDefaults?.set(token, forKey: tokenKey)
    }

    func loadToken() -> String? {
        keychain[string: tokenKey] ?? sharedDefaults?.string(forKey: tokenKey)
    }

    func clearToken() {
        try? keychain.remove(tokenKey)
        sharedDefaults?.removeObject(forKey: tokenKey)
    }

    func saveServerURL(_ url: URL) {
        keychain[string: serverURLKey] = url.absoluteString
        sharedDefaults?.set(url.absoluteString, forKey: serverURLKey)
    }

    func loadServerURL() -> URL? {
        if let string = keychain[string: serverURLKey] {
            return URL(string: string)
        }
        if let string = sharedDefaults?.string(forKey: serverURLKey) {
            return URL(string: string)
        }
        return nil
    }

    func clearServerURL() {
        try? keychain.remove(serverURLKey)
        sharedDefaults?.removeObject(forKey: serverURLKey)
    }
}
