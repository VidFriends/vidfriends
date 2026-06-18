import SwiftUI
import AVKit

struct FYPFeedView: View {
    @Environment(AppState.self) private var appState

    @State private var videos: [Video] = []
    @State private var isLoading = true
    @State private var isLoadingMore = false
    @State private var cursor: String?
    @State private var hasMore = true
    @State private var error: String?
    @State private var hasFailedOnce = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading feed...")
                    .accessibilityLabel("Loading FYP feed")
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
                            Task { await loadInitialFeed() }
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
                feedContent
            }
        }
        .task { await loadInitialFeed() }
    }

    private var feedContent: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(Array(videos.enumerated()), id: \.element.id) { index, video in
                    FYPVideoCell(
                        video: video,
                        onLike: { await toggleLike(video) }
                    )
                    .containerRelativeFrame(.vertical)
                    .onAppear {
                        if index == videos.count - 2, hasMore, !isLoadingMore {
                            Task { await loadMore() }
                        }
                    }
                }

                if isLoadingMore {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 60)
                        .accessibilityLabel("Loading more videos")
                }

                if !hasMore, !videos.isEmpty {
                    Text("You're all caught up!")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 60)
                        .accessibilityLabel("No more videos")
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .ignoresSafeArea()
        .refreshable { await loadInitialFeed() }
        .accessibilityLabel("For You Page feed")
    }

    private func loadInitialFeed() async {
        isLoading = true
        error = nil
        cursor = nil
        hasMore = true
        defer { isLoading = false }
        do {
            let response = try await appState.apiClient.getPaginatedFeed(cursor: nil)
            videos = response.videos.filter { !appState.blockedUserIds.contains($0.userId) }
            cursor = response.nextCursor
            hasMore = response.nextCursor != nil
            hasFailedOnce = false
        } catch {
            self.error = error.localizedDescription
            hasFailedOnce = true
        }
    }

    private func loadMore() async {
        guard !isLoadingMore, let cursor else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response = try await appState.apiClient.getPaginatedFeed(cursor: cursor)
            let newVideos = response.videos.filter { !appState.blockedUserIds.contains($0.userId) }
            videos.append(contentsOf: newVideos)
            self.cursor = response.nextCursor
            hasMore = response.nextCursor != nil
        } catch {
            hasMore = false
        }
    }

    private func toggleLike(_ video: Video) async {
        do {
            if video.liked == true {
                try await appState.apiClient.unlikeVideo(id: video.id)
            } else {
                try await appState.apiClient.likeVideo(id: video.id)
            }
            if let index = videos.firstIndex(where: { $0.id == video.id }) {
                var updated = video
                updated.liked = video.liked == true ? false : true
                updated.likeCount = (video.likeCount ?? 0) + (updated.liked == true ? 1 : -1)
                videos[index] = updated
            }
        } catch {}
    }
}
