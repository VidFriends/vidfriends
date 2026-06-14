import SwiftUI

struct ProfileView: View {
    @Environment(AppState.self) private var appState

    @State private var user: User?
    @State private var sentVideos: [SentVideo] = []
    @State private var receivedVideos: [InboxItem] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var hasFailedOnce = false
    @State private var showEditProfile = false
    @State private var editingDisplayName = ""
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading profile...")
                        .accessibilityLabel("Loading profile")
                } else if let error {
                    ContentUnavailableView(
                        "Could Not Load Profile",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                    .accessibilityLabel("Profile error: \(error)")
                    .overlay(alignment: .bottom) {
                        if hasFailedOnce {
                            Button {
                                Task { await loadProfile() }
                            } label: {
                                Label("Retry", systemImage: "arrow.clockwise")
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 12)
                            }
                            .buttonStyle(.borderedProminent)
                            .padding(.bottom, 40)
                            .accessibilityLabel("Retry loading profile")
                        }
                    }
                } else if let user {
                    List {
                        profileSection(user: user)
                        sentSection
                        receivedSection
                    }
                    .listStyle(.plain)
                    .accessibilityLabel("Profile list")
                } else {
                    ContentUnavailableView(
                        "No Profile Data",
                        systemImage: "person.slash",
                        description: Text("Could not load profile information.")
                    )
                    .accessibilityLabel("No profile data available")
                }
            }
            .navigationTitle("Profile")
            .task { await loadProfile() }
            .refreshable { await loadProfile() }
            .alert("Edit Profile", isPresented: $showEditProfile) {
                TextField("Display Name", text: $editingDisplayName)
                    .accessibilityLabel("Display name")
                Button("Save") { Task { await saveProfile() } }
                    .accessibilityLabel("Save display name")
                Button("Cancel", role: .cancel) {}
                    .accessibilityLabel("Cancel editing")
            } message: {
                Text("Enter your display name.")
            }
        }
    }

    @ViewBuilder
    private func profileSection(user: User) -> some View {
        Section {
            HStack(spacing: 16) {
                avatarView(url: user.avatarURL)

                VStack(alignment: .leading, spacing: 4) {
                    Text(user.displayName ?? user.username)
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("@\(user.username)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(user.email)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .accessibilityLabel("\(user.displayName ?? user.username), username \(user.username), email \(user.email)")

                Spacer()

                Button("Edit") {
                    editingDisplayName = user.displayName ?? ""
                    showEditProfile = true
                }
                .buttonStyle(.bordered)
                .disabled(isSaving)
                .accessibilityLabel("Edit profile")
                .accessibilityHint("Opens a dialog to change your display name")
            }
            .padding(.vertical, 8)
        }
    }

    @ViewBuilder
    private var sentSection: some View {
        if !sentVideos.isEmpty {
            Section("Sent Videos") {
                ForEach(sentVideos) { video in
                    SentVideoRowView(video: video)
                }
            }
        }
    }

    @ViewBuilder
    private var receivedSection: some View {
        if !receivedVideos.isEmpty {
            Section("Received") {
                ForEach(receivedVideos) { item in
                    InboxRowView(item: item)
                }
            }
        }
    }

    @ViewBuilder
    private func avatarView(url: String?) -> some View {
        if let avatarURL = url.flatMap({ URL(string: $0) }) {
            AsyncImage(url: avatarURL) { phase in
                if let image = phase.image {
                    image.resizable().aspectRatio(contentMode: .fill)
                        .accessibilityHidden(true)
                } else {
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: 64, height: 64)
            .clipShape(Circle())
            .accessibilityHidden(true)
        } else {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
    }

    private func loadProfile() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            async let userTask = appState.apiClient.getCurrentUser()
            async let sentTask = appState.apiClient.getSentVideos()
            async let inboxTask = appState.apiClient.getInbox()
            user = try await userTask
            sentVideos = try await sentTask
            receivedVideos = try await inboxTask
            hasFailedOnce = false
        } catch {
            self.error = error.localizedDescription
            hasFailedOnce = true
        }
    }

    private func saveProfile() async {
        isSaving = true
        defer { isSaving = false }
        do {
            user = try await appState.apiClient.updateProfile(displayName: editingDisplayName.isEmpty ? nil : editingDisplayName)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct SentVideoRowView: View {
    let video: SentVideo

    var body: some View {
        HStack(spacing: 12) {
            thumbnail
            details
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sent video: \(video.title), to \(video.recipientName)")
    }

    @ViewBuilder
    private var thumbnail: some View {
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
            .frame(width: 60, height: 60)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .accessibilityHidden(true)
        } else {
            Rectangle()
                .fill(.quaternary)
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay {
                    Image(systemName: "paperplane.fill")
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
                .accessibilityHidden(true)
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(video.title)
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(1)
            Text("To: \(video.recipientName)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text("Sent \(video.createdAt)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    ProfileView()
        .environment(AppState())
}
