import SwiftUI
import AVKit

struct VideoPlayerView: View {
    let video: Video
    let onDownload: () -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer?
    @State private var isShowingControls = true
    @State private var isDownloading = false
    @State private var downloadCompleted = false
    @State private var downloadError: String?
    @State private var hasWatched = false
    @State private var watchTimer: Task<Void, Never>?

    private static let watchTimeThreshold: UInt64 = 5_000_000_000 // 5 seconds minimum watch before download appears

    private var fileURL: URL? {
        video.fileURL.flatMap { URL(string: $0) }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player = player {
                VideoPlayerController(player: player)
                    .ignoresSafeArea()
                    .overlay(alignment: .topTrailing) {
                        if isShowingControls {
                            controlsOverlay
                        }
                    }
                    .overlay(alignment: .bottom) {
                        if let error = downloadError {
                            Text(error)
                                .font(.caption).foregroundStyle(.red)
                                .padding(8)
                                .background(.ultraThinMaterial)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .padding(.bottom, 60)
                                .accessibilityLabel("Download error: \(error)")
                        }
                    }
                    .onTapGesture {
                        withAnimation { isShowingControls.toggle() }
                    }
            } else {
                ProgressView()
                    .tint(.white)
                    .accessibilityLabel("Loading video player")
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .onAppear {
            guard let url = fileURL else { return }
            player = AVPlayer(url: url)
            player?.play()
            watchTimer = Task {
                try? await Task.sleep(nanoseconds: Self.watchTimeThreshold)
                if !Task.isCancelled {
                    hasWatched = true
                }
            }
        }
        .onDisappear {
            watchTimer?.cancel()
            watchTimer = nil
            player?.pause()
            player = nil
        }
    }

    @ViewBuilder
    private var controlsOverlay: some View {
        HStack(spacing: 12) {
            if downloadCompleted {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.green)
                    .accessibilityLabel("Video downloaded")
            } else if isDownloading {
                ProgressView()
                    .tint(.white)
                    .accessibilityLabel("Downloading video")
            } else if hasWatched {
                Button {
                    Task { await performDownload() }
                } label: {
                    Image(systemName: "arrow.down.circle")
                        .font(.title2)
                        .foregroundStyle(.white, .black.opacity(0.4))
                }
                .accessibilityLabel("Download video")
            }

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.white, .black.opacity(0.4))
            }
            .accessibilityLabel("Close video")
        }
        .padding()
    }

    private func performDownload() async {
        isDownloading = true
        downloadError = nil
        do {
            try await appState.downloadService.downloadVideo(
                videoId: video.id,
                title: video.title,
                thumbnailURL: video.thumbnailURL,
                duration: video.duration
            )
            downloadCompleted = true
            onDownload()
        } catch {
            downloadError = error.localizedDescription
        }
        isDownloading = false
    }
}
