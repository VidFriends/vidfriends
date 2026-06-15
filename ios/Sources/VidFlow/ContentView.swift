import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState
    @State private var onboardingCoordinator = OnboardingCoordinator()

    var body: some View {
        Group {
            if appState.isAuthenticated {
                mainTabs
            } else {
                onboardingFlow
            }
        }
        .task {
            appState.pushService.setDelegate()
            await registerPushIfNeeded()
        }
    }

    @ViewBuilder
    private var onboardingFlow: some View {
        switch onboardingCoordinator.step {
        case .serverSetup:
            ServerSetupView(coordinator: onboardingCoordinator)
                .transition(.opacity)
        case .auth:
            OnboardingAuthView(coordinator: onboardingCoordinator)
                .transition(.opacity)
        case .biometryOptIn:
            BiometryOptInView(coordinator: onboardingCoordinator)
                .transition(.opacity)
        }
    }

    private var mainTabs: some View {
        TabView {
            FeedView()
                .tabItem {
                    Label("Feed", systemImage: "play.rectangle")
                }
                .accessibilityLabel("Feed tab")

            SendVideoView()
                .tabItem {
                    Label("Send", systemImage: "paperplane")
                }
                .accessibilityLabel("Send video tab")

            InboxView()
                .tabItem {
                    Label("Inbox", systemImage: "tray")
                }
                .accessibilityLabel("Inbox tab")

            HistoryView()
                .tabItem {
                    Label("History", systemImage: "clock.arrow.circlepath")
                }
                .accessibilityLabel("History tab")

            CollectionsView()
                .tabItem {
                    Label("Collections", systemImage: "folder")
                }
                .accessibilityLabel("Collections tab")

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle")
                }
                .accessibilityLabel("Profile tab")
        }
        .accessibilityLabel("Main tabs")
    }

    private func registerPushIfNeeded() async {
        guard appState.isAuthenticated else { return }
        let granted = await appState.pushService.requestAuthorization()
        guard granted else { return }
        appState.pushService.registerForRemoteNotifications()
    }
}
