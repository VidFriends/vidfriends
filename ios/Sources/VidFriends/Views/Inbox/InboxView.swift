import SwiftUI

struct InboxView: View {
    @Environment(AppState.self) private var appState

    @State private var items: [InboxItem] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var hasFailedOnce = false
    @State private var showBanner = false
    @State private var bannerItem: InboxItem?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading inbox...")
                        .accessibilityLabel("Loading inbox")
                } else if let error {
                    ContentUnavailableView(
                        "Could Not Load Inbox",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                    .accessibilityLabel("Inbox error: \(error)")
                    .overlay(alignment: .bottom) {
                        if hasFailedOnce {
                            Button {
                                Task { await loadInbox() }
                            } label: {
                                Label("Retry", systemImage: "arrow.clockwise")
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 12)
                            }
                            .buttonStyle(.borderedProminent)
                            .padding(.bottom, 40)
                            .accessibilityLabel("Retry loading inbox")
                        }
                    }
                } else if items.isEmpty {
                    ContentUnavailableView(
                        "Empty Inbox",
                        systemImage: "tray",
                        description: Text("Videos sent to you will appear here.")
                    )
                    .accessibilityLabel("Empty inbox. Videos sent to you will appear here.")
                } else {
                    List(items) { item in
                        NavigationLink {
                            VideoReceiverView(inboxItem: item)
                        } label: {
                            InboxRowView(item: item)
                        }
                        .buttonStyle(.plain)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button("Reject", role: .destructive) {
                                Task { await rejectItem(item) }
                            }
                            .tint(.red)
                            .accessibilityLabel("Reject video from \(item.fromUserName)")
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button("Accept") {
                                Task { await acceptItem(item) }
                            }
                            .tint(.green)
                            .accessibilityLabel("Accept video from \(item.fromUserName)")
                        }
                    }
                    .listStyle(.plain)
                    .accessibilityLabel("Inbox list")
                }
            }
            .navigationTitle("Inbox")
            .task { await loadInbox() }
            .refreshable { await loadInbox() }
        }
        .overlay(alignment: .top) {
            if showBanner, let bannerItem {
                NotificationBannerView(item: bannerItem) {
                    await acceptItem(bannerItem)
                    showBanner = false
                } onDismiss: {
                    showBanner = false
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .padding(.horizontal)
            }
        }
        .animation(.spring(response: 0.4), value: showBanner)
        .onReceive(NotificationCenter.default.publisher(for: .didReceiveForegroundNotification)) { notification in
            guard
                let aps = notification.userInfo?["aps"] as? [String: Any],
                let videoId = aps["video_id"] as? String ?? (aps["data"] as? [String: Any])?["video_id"] as? String
            else { return }
            Task {
                await showBannerForNotification(videoId: videoId, aps: aps)
            }
        }
    }

    private func loadInbox() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            items = try await appState.apiClient.getInbox()
            hasFailedOnce = false
        } catch {
            self.error = error.localizedDescription
            hasFailedOnce = true
        }
    }

    private func acceptItem(_ item: InboxItem) async {
        do {
            try await appState.apiClient.updateInboxItem(id: item.id, status: "accepted")
            await loadInbox()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func rejectItem(_ item: InboxItem) async {
        do {
            try await appState.apiClient.updateInboxItem(id: item.id, status: "rejected")
            await loadInbox()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func showBannerForNotification(videoId: String, aps: [String: Any]) async {
        do {
            let inboxItems = try await appState.apiClient.getInbox()
            if let match = inboxItems.first(where: { $0.videoId == videoId }) {
                bannerItem = match
            } else {
                bannerItem = fallbackBannerItem(videoId: videoId, aps: aps)
            }
        } catch {
            bannerItem = fallbackBannerItem(videoId: videoId, aps: aps)
        }
        withAnimation { showBanner = true }
    }

    private func fallbackBannerItem(videoId: String, aps: [String: Any]) -> InboxItem {
        let title = (aps["alert"] as? [String: Any])?["title"] as? String ?? "New video"
        let fromName = (aps["alert"] as? [String: Any])?["body"] as? String ?? "Someone"
        return InboxItem(
            id: videoId,
            videoId: videoId,
            fromUserId: "",
            fromUserName: fromName,
            title: title,
            thumbnailURL: nil,
            status: "pending",
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
    }
}

// MARK: - Row

struct InboxRowView: View {
    let item: InboxItem

    var body: some View {
        HStack(spacing: 12) {
            thumbnail
            details
            Spacer()
            statusIcon
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.title), from \(item.fromUserName)")
        .accessibilityHint("Swipe right to accept, swipe left to reject")
        .accessibilityValue("Status: \(item.status)")
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let url = item.thumbnailURL.flatMap({ URL(string: $0) }) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().aspectRatio(contentMode: .fill)
                        .accessibilityHidden(true)
                } else {
                    Rectangle().fill(.quaternary)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: 60, height: 60)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityHidden(true)
        } else {
            Rectangle()
                .fill(.quaternary)
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay {
                    Image(systemName: "video.fill")
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
                .accessibilityHidden(true)
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.title)
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(1)
            Text("From: \(item.fromUserName)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Sent \(item.createdAt)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch item.status {
        case "pending":
            Image(systemName: "clock.fill")
                .foregroundStyle(.orange)
                .accessibilityLabel("Pending")
        case "accepted":
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .accessibilityLabel("Accepted")
        case "rejected":
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(.red)
                .accessibilityLabel("Rejected")
        default:
            EmptyView()
        }
    }
}

// MARK: - Notification Banner

struct NotificationBannerView: View {
    let item: InboxItem
    let onAccept: () async -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "video.badge.plus")
                .font(.title3)
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("New video from \(item.fromUserName)")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                Text(item.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .accessibilityLabel("New video from \(item.fromUserName): \(item.title)")

            Spacer()

            Button {
                Task { await onAccept() }
            } label: {
                Image(systemName: "checkmark")
                    .padding(8)
                    .background(.green.opacity(0.2), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Accept video")
            .accessibilityHint("Accepts and downloads the video")

            Button {
                onDismiss()
            } label: {
                Image(systemName: "xmark")
                    .padding(8)
                    .background(.quaternary, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss notification")
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .shadow(radius: 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("New video notification")
    }
}

// MARK: - Video Receiver

struct VideoReceiverView: View {
    let inboxItem: InboxItem

    @Environment(AppState.self) private var appState
    @State private var video: Video?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading video...")
                    .accessibilityLabel("Loading received video")
            } else if let error {
                ContentUnavailableView(
                    "Could Not Load Video",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
                .accessibilityLabel("Video error: \(error)")
            } else if let video {
                videoContent
            } else {
                ContentUnavailableView(
                    "Video Not Available",
                    systemImage: "video.slash",
                    description: Text("This video could not be found.")
                )
                .accessibilityLabel("Video not found")
            }
        }
        .navigationTitle(inboxItem.fromUserName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadVideo() }
    }

    @ViewBuilder
    private var videoContent: some View {
        if let url = video.fileURL.flatMap({ URL(string: $0) }) {
            VideoPlayerView(video: video, onDownload: {})
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        if inboxItem.status == "pending" {
                            Button("Accept") {
                                Task { await acceptVideo() }
                            }
                            .accessibilityLabel("Accept received video")
                        }
                    }
                }
        } else {
            VStack(spacing: 20) {
                if let thumb = video.thumbnailURL.flatMap({ URL(string: $0) }) {
                    AsyncImage(url: thumb) { phase in
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

                if inboxItem.status == "pending" {
                    HStack(spacing: 16) {
                        Button(role: .destructive) {
                            Task { await rejectVideo() }
                        } label: {
                            Label("Reject", systemImage: "xmark")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        Button {
                            Task { await acceptVideo() }
                        } label: {
                            Label("Accept", systemImage: "checkmark")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(.horizontal)
                }
            }
            .padding()
        }
    }

    private func loadVideo() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            video = try await appState.apiClient.getVideoDetail(id: inboxItem.videoId)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func acceptVideo() async {
        do {
            try await appState.apiClient.updateInboxItem(id: inboxItem.id, status: "accepted")
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func rejectVideo() async {
        do {
            try await appState.apiClient.updateInboxItem(id: inboxItem.id, status: "rejected")
        } catch {
            self.error = error.localizedDescription
        }
    }
}
