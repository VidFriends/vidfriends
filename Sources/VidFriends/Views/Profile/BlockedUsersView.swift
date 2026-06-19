import SwiftUI

struct BlockedUsersView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    let blockedUsers: [BlockedUser]
    @State private var users = [BlockedUser]()

    var body: some View {
        NavigationStack {
            Group {
                if users.isEmpty {
                    ContentUnavailableView(
                        "No Blocked Users",
                        systemImage: "hand.raised.slash",
                        description: Text("Users you block will appear here.")
                    )
                    .accessibilityLabel("No blocked users")
                } else {
                    List {
                        ForEach(users) { user in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(user.displayName ?? user.username)
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                    if user.displayName != nil {
                                        Text("@\(user.username)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .accessibilityLabel("\(user.displayName ?? user.username), username \(user.username)")

                                Spacer()

                                Button("Unblock") {
                                    Task { await unblockUser(user) }
                                }
                                .buttonStyle(.bordered)
                                .tint(.red)
                                .accessibilityLabel("Unblock \(user.displayName ?? user.username)")
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.plain)
                    .accessibilityLabel("Blocked users list")
                }
            }
            .navigationTitle("Blocked Users")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityLabel("Done viewing blocked users")
                }
            }
            .task { users = blockedUsers }
            .refreshable { await loadBlocked() }
        }
    }

    private func loadBlocked() async {
        do {
            users = try await appState.apiClient.getBlockedUsers()
        } catch {
            users = []
        }
    }

    private func unblockUser(_ user: BlockedUser) async {
        do {
            try await appState.apiClient.unblockUser(id: user.id)
            users.removeAll { $0.id == user.id }
            await appState.loadBlockedUserIds()
        } catch {
            // Handle error
        }
    }
}

#Preview {
    BlockedUsersView(blockedUsers: [
        BlockedUser(id: "u4", username: "dave", displayName: nil, blockedAt: "2026-06-14T00:00:00Z"),
    ])
}
