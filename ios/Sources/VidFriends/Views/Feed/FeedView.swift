import SwiftUI

struct FeedView: View {
    @Environment(AppState.self) private var appState

    @State private var videos: [Video] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var hasFailedOnce = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading feed...")
                        .accessibilityLabel("Loading feed")
                } else if let error {
                    ContentUnavailableView(
                        "Could Not Load Feed",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                    .accessibilityLabel("Feed error: \(error)")
                    .overlay(alignment: .bottom) {
                        if hasFailedOnce {
                            Button {
                                Task { await loadFeed() }
                            } label: {
                                Label("Retry", systemImage: "arrow.clockwise")
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 12)
                            }
                            .buttonStyle(.borderedProminent)
                            .padding(.bottom, 40)
                            .accessibilityLabel("Retry loading feed")
                        }
                    }
                } else if videos.isEmpty {
                    ContentUnavailableView(
                        "No Videos Yet",
                        systemImage: "video.slash",
                        description: Text("Follow friends to see their videos here.")
                    )
                    .accessibilityLabel("No videos. Follow friends to see their videos here.")
                } else {
                    List(videos) { video in
                        NavigationLink {
                            VideoPlayerView(video: video, onDownload: {})
                        } label: {
                            VideoRowView(video: video)
                        }
                        .accessibilityHint("Double tap to play video")
                    }
                    .listStyle(.plain)
                    .accessibilityLabel("Feed video list")
                }
            }
            .navigationTitle("Feed")
            .task { await loadFeed() }
            .refreshable { await loadFeed() }
        }
    }

    private func loadFeed() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let allVideos = try await appState.apiClient.getFeed()
            videos = allVideos.filter { !appState.blockedUserIds.contains($0.userId) }
            hasFailedOnce = false
        } catch {
            self.error = error.localizedDescription
            hasFailedOnce = true
        }
    }
}

struct VideoRowView: View {
    let video: Video

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
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
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityHidden(true)
            }

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(video.title)
                        .font(.headline)
                        .lineLimit(1)
                    if let userName = video.userName {
                        Text(userName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityLabel("\(video.title) by \(video.userName ?? "unknown")")

                Spacer()

                if let likes = video.likeCount {
                    HStack(spacing: 2) {
                        Image(systemName: video.liked == true ? "heart.fill" : "heart")
                            .foregroundStyle(video.liked == true ? .red : .secondary)
                            .accessibilityHidden(true)
                        Text("\(likes)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("\(likes) likes")
                }
            }
            .padding(.horizontal, 4)
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(video.title)
        .accessibilityHint("Double tap to view video")
    }
}
