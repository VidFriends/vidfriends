import SwiftUI

struct BiometryOptInView: View {
    @Environment(AppState.self) private var appState
    let coordinator: OnboardingCoordinator

    @State private var isFinalizing = false

    private let biometry: BiometryServiceProtocol

    init(coordinator: OnboardingCoordinator, biometry: BiometryServiceProtocol = BiometryService()) {
        self.coordinator = coordinator
        self.biometry = biometry
    }

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: biometry.availableBiometryType == .faceID
                  ? "faceid" : "touchid")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            Text("Quick Access")
                .font(.title2)
                .fontWeight(.bold)

            Text(biometry.availableBiometryType == .faceID
                 ? "Use Face ID to log in faster next time."
                 : "Use Touch ID to log in faster next time.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()

            if isFinalizing {
                ProgressView("Finishing setup…")
            } else {
                if biometry.isAvailable {
                    Button(action: enableBiometry) {
                        Text("Enable \(biometry.availableBiometryType == .faceID ? "Face ID" : "Touch ID")")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.accentColor)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                    .padding(.horizontal)
                }

                Button(action: skip) {
                    Text("Skip")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal)
            }
        }
        .padding(.vertical, 40)
    }

    private func enableBiometry() {
        Task {
            let success = try? await biometry.authenticate()
            if success == true {
                UserDefaults.standard.set(true, forKey: "biometry_enabled")
            }
            await finalizeOnboarding()
        }
    }

    private func skip() {
        Task {
            await finalizeOnboarding()
        }
    }

    private func finalizeOnboarding() async {
        isFinalizing = true
        guard let token = coordinator.pendingToken else { return }
        try? await appState.completeAuth(token: token)
    }
}
