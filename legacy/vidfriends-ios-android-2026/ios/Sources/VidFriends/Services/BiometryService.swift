import Foundation
import LocalAuthentication

protocol BiometryServiceProtocol {
    var availableBiometryType: BiometryService.BiometryType { get }
    var isAvailable: Bool { get }
    func authenticate(reason: String) async throws -> Bool
}

extension BiometryServiceProtocol {
    func authenticate() async throws -> Bool {
        try await authenticate(reason: "Log in to VidFriends")
    }
}

final class BiometryService: BiometryServiceProtocol {
    enum BiometryType {
        case faceID
        case touchID
        case none
    }

    var availableBiometryType: BiometryType {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }
        return context.biometryType == .faceID ? .faceID : .touchID
    }

    var isAvailable: Bool {
        availableBiometryType != .none
    }

    func authenticate(reason: String = "Log in to VidFriends") async throws -> Bool {
        let context = LAContext()
        return try await context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: reason
        )
    }
}
