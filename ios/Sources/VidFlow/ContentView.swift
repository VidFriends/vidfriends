import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        Group {
            if appState.isAuthenticated {
                mainTabs
            } else {
                WelcomeView()
            }
        }
        .task {
            await registerPushIfNeeded()
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

// MARK: - Welcome

struct WelcomeView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "video.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)
            Text("VidFlow")
                .font(.largeTitle)
                .fontWeight(.bold)
                .accessibilityAddTraits(.isHeader)
            Text("Share short videos with friends")
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("VidFlow. Share short videos with friends.")
    }
}

#Preview {
    ContentView()
        .environment(AppState())
}
