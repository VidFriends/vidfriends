import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @State private var onboardingCoordinator = OnboardingCoordinator()
    @State private var deepLinkVideoId: String?
    @State private var showDeepLinkedVideo = false

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
            await appState.loadBlockedUserIds()
        }
        .onOpenURL { url in
            handleDeepLink(url)
        }
        .onReceive(NotificationCenter.default.publisher(for: .didTapNotification)) { notification in
            let userInfo = notification.userInfo
            if let aps = userInfo?["aps"] as? [String: Any],
               let videoId = aps["video_id"] as? String ?? (aps["data"] as? [String: Any])?["video_id"] as? String {
                deepLinkVideoId = videoId
                showDeepLinkedVideo = true
            }
        }
        .sheet(isPresented: $showDeepLinkedVideo) {
            if let videoId = deepLinkVideoId {
                VideoDetailView(videoId: videoId)
            }
        }
        .onAppear {
            if appState.offlineService == nil {
                appState.configureOfflineService(with: modelContext)
            }
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

            OfflineDownloadsView()
                .tabItem {
                    Label("Offline", systemImage: "arrow.down.circle")
                }
                .accessibilityLabel("Offline downloads tab")

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

    private func handleDeepLink(_ url: URL) {
        guard let host = url.host else { return }
        if host == "video" {
            let videoId = url.lastPathComponent
            deepLinkVideoId = videoId
            showDeepLinkedVideo = true
        }
    }
}

struct VideoDetailView: View {
    let videoId: String
    @Environment(AppState.self) private var appState
    @State private var video: Video?
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading video...")
                        .accessibilityLabel("Loading video detail")
                } else if let video {
                    VStack(spacing: 16) {
                        if let url = video.thumbnailURL.flatMap({ URL(string: $0) }) {
                            AsyncImage(url: url) { phase in
                                if let image = phase.image {
                                    image.resizable().aspectRatio(contentMode: .fill)
                                        .accessibilityHidden(true)
                                } else {
                                    Rectangle().fill(.quaternary)
                                        .accessibilityHidden(true)
                                }
                            }
                            .frame(height: 300)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        Text(video.title)
                            .font(.title2)
                            .fontWeight(.bold)
                        if let userName = video.userName {
                            Text("By \(userName)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .padding()
                    .navigationTitle("Video")
                    .navigationBarTitleDisplayMode(.inline)
                    .accessibilityLabel("Video: \(video.title)")
                } else {
                    ContentUnavailableView(
                        "Video Not Found",
                        systemImage: "video.slash",
                        description: Text("Could not load the requested video.")
                    )
                    .accessibilityLabel("Video not found")
                }
            }
        }
        .task {
            await loadVideo()
        }
    }

    private func loadVideo() async {
        isLoading = true
        defer { isLoading = false }
        do {
            video = try await appState.apiClient.getVideoDetail(id: videoId)
        } catch {
            video = nil
        }
    }
}

#Preview {
    ContentView()
        .environment(AppState())
}
