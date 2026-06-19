import SwiftUI
import AVKit

struct FYPVideoCell: View {
    let video: Video
    let onLike: () async -> Void

    @Environment(AppState.self) private var appState
    @State private var player: AVPlayer?
    @State private var showComments = false
    @State private var isLiked: Bool
    @State private var likeCount: Int

    init(video: Video, onLike: @escaping () async -> Void) {
        self.video = video
        self.onLike = onLike
        self._isLiked = State(initialValue: video.liked == true)
        self._likeCount = State(initialValue: video.likeCount ?? 0)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player {
                VideoPlayerController(player: player)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            } else {
                ProgressView()
                    .tint(.white)
                    .accessibilityLabel("Loading video")
            }

            gradientOverlay

            VStack {
                Spacer()

                HStack(alignment: .bottom, spacing: 16) {
                    infoSection
                    Spacer()
                    actionButtons
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 60)
            }
        }
        .onAppear {
            guard let url = video.fileURL.flatMap({ URL(string: $0) }) else { return }
            let newPlayer = AVPlayer(url: url)
            player = newPlayer
            newPlayer.play()
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
        .sheet(isPresented: $showComments) {
            CommentsView(videoId: video.id)
        }
        .accessibilityLabel("Video: \(video.title) by \(video.userName ?? "unknown")")
    }

    private var gradientOverlay: some View {
        LinearGradient(
            stops: [
                .init(color: .black.opacity(0.0), location: 0.3),
                .init(color: .black.opacity(0.6), location: 1.0),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .allowsHitTesting(false)
    }

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let userName = video.userName {
                HStack(spacing: 6) {
                    Image(systemName: "person.circle.fill")
                        .font(.callout)
                        .accessibilityHidden(true)
                    Text(userName)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                }
                .accessibilityLabel("Posted by \(userName)")
            }

            Text(video.title)
                .font(.body)
                .fontWeight(.medium)
                .lineLimit(3)
                .accessibilityLabel("Title: \(video.title)")

            if let description = video.description {
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.8))
                    .lineLimit(2)
            }
        }
        .foregroundStyle(.white)
        .shadow(radius: 2)
    }

    private var actionButtons: some View {
        VStack(spacing: 20) {
            Button {
                Task { await performLike() }
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: isLiked ? "heart.fill" : "heart")
                        .font(.title2)
                        .foregroundStyle(isLiked ? .red : .white)
                        .shadow(radius: 1)
                        .accessibilityHidden(true)
                    Text("\(likeCount)")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundStyle(.white)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isLiked ? "Unlike video" : "Like video")
            .accessibilityValue("\(likeCount) likes")

            Button {
                showComments = true
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "bubble.right.fill")
                        .font(.title2)
                        .foregroundStyle(.white)
                        .shadow(radius: 1)
                        .accessibilityHidden(true)
                    Text("\(video.commentCount ?? 0)")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .foregroundStyle(.white)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("View comments")

            Button {
                Task { await shareVideo() }
            } label: {
                Image(systemName: "arrowshape.turn.up.right.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .shadow(radius: 1)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Share video")
        }
        .padding(.trailing, 4)
    }

    private func performLike() async {
        isLiked.toggle()
        likeCount += isLiked ? 1 : -1
        await onLike()
    }

    private func shareVideo() async {
        guard let url = video.fileURL.flatMap({ URL(string: $0) }) else { return }
        let activityVC = UIActivityViewController(
            activityItems: [url, video.title],
            applicationActivities: nil
        )
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = windowScene.windows.first?.rootViewController else { return }
        root.present(activityVC, animated: true)
    }
}
