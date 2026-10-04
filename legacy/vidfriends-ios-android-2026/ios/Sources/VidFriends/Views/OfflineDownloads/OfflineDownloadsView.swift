import SwiftUI
import SwiftData
import AVKit

struct OfflineDownloadsView: View {
    @Environment(AppState.self) private var appState
    @Query(sort: \DownloadedVideo.downloadedAt, order: .reverse) private var downloads: [DownloadedVideo]

    @State private var selectedDownload: DownloadedVideo?
    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            Group {
                if downloads.isEmpty {
                    ContentUnavailableView(
                        "No Offline Videos",
                        systemImage: "arrow.down.circle.dotted",
                        description: Text("Download videos from your feed to watch them offline.")
                    )
                    .accessibilityLabel("No offline videos. Download videos from your feed to watch them offline.")
                } else {
                    List {
                        ForEach(downloads) { download in
                            NavigationLink {
                                OfflinePlaybackView(download: download)
                            } label: {
                                OfflineDownloadRowView(download: download)
                            }
                            .accessibilityLabel(download.title)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    selectedDownload = download
                                    showDeleteConfirmation = true
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                .accessibilityLabel("Delete \(download.title)")
                            }
                        }
                    }
                    .listStyle(.plain)
                    .accessibilityLabel("Downloaded videos list")
                }
            }
            .navigationTitle("Offline")
            .confirmationDialog(
                "Delete Download?",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    if let download = selectedDownload {
                        appState.downloadService.deleteDownload(download)
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The downloaded video file will be removed from this device.")
            }
        }
    }
}

private struct OfflineDownloadRowView: View {
    let download: DownloadedVideo
    @Environment(AppState.self) private var appState

    var body: some View {
        HStack(spacing: 12) {
            if let url = download.thumbnailURL.flatMap({ URL(string: $0) }) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().aspectRatio(contentMode: .fill)
                            .accessibilityHidden(true)
                    } else {
                        Rectangle().fill(.quaternary)
                            .accessibilityHidden(true)
                    }
                }
                .frame(width: 80, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Rectangle()
                    .fill(.quaternary)
                    .frame(width: 80, height: 60)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay {
                        Image(systemName: "video.fill")
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                    }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(download.title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(2)
                if download.fileSize > 0 {
                    Text(appState.downloadService.videoSizeString(download))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(download.downloadedAt, style: .date)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .accessibilityLabel("\(download.title), \(download.fileSize > 0 ? appState.downloadService.videoSizeString(download) : "unknown size"), downloaded \(download.downloadedAt.formatted(date: .abbreviated, time: .omitted))")
        }
        .padding(.vertical, 4)
    }
}

private struct OfflinePlaybackView: View {
    let download: DownloadedVideo

    @State private var player: AVPlayer?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player = player {
                VideoPlayerController(player: player)
                    .ignoresSafeArea()
            } else {
                ProgressView()
                    .tint(.white)
                    .accessibilityLabel("Loading video")
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .onAppear {
            let fileURL = URL(filePath: download.localFileURL)
            player = AVPlayer(url: fileURL)
            player?.play()
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }
}
