import SwiftUI

struct FriendPickerView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    let onSelect: (UserSearchResult) -> Void

    @State private var searchQuery = ""
    @State private var results: [UserSearchResult] = []
    @State private var friends: [Friend] = []
    @State private var isSearching = false
    @State private var isLoadingFriends = true
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack {
                    TextField("Search users...", text: $searchQuery)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .onSubmit { Task { await search() } }
                        .accessibilityLabel("Search users")
                        .accessibilityHint("Enter a name to search for users")

                    Button("Search") {
                        Task { await search() }
                    }
                    .disabled(searchQuery.isEmpty || isSearching)
                    .accessibilityLabel("Search")
                    .accessibilityHint("Searches for users matching the entered name")
                }
                .padding()

                if isSearching || isLoadingFriends {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 100)
                        .accessibilityLabel(isSearching ? "Searching users" : "Loading friends")
                } else if let errorMessage {
                    ContentUnavailableView(
                        "Error",
                        systemImage: "exclamationmark.triangle",
                        description: Text(errorMessage)
                    )
                    .accessibilityLabel("Error: \(errorMessage)")
                    .overlay(alignment: .bottom) {
                        Button {
                            Task { if searchQuery.isEmpty { await loadFriends() } else { await search() } }
                        } label: {
                            Label("Retry", systemImage: "arrow.clockwise")
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                        }
                        .buttonStyle(.borderedProminent)
                        .padding(.bottom, 40)
                        .accessibilityLabel("Retry")
                    }
                } else if searchQuery.isEmpty {
                    friendsList
                } else {
                    searchResultsList
                }
            }
            .navigationTitle("Send To")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityLabel("Cancel friend selection")
                }
            }
            .task { await loadFriends() }
        }
    }

    // MARK: - Friends List

    private var friendsList: some View {
        Group {
            if friends.isEmpty {
                ContentUnavailableView(
                    "No Friends Yet",
                    systemImage: "person.slash",
                    description: Text("Add friends to send them videos.")
                )
                .accessibilityLabel("No friends yet. Add friends to send them videos.")
            } else if let currentUserId = appState.currentUser?.id {
                List(friends) { friend in
                    // Determine if current user is requester or addressee
                    let isRequester = friend.requesterId == currentUserId
                    let friendId = isRequester ? friend.addresseeId : friend.requesterId

                    Button {
                        let friendName = friend.username ?? friendId
                        let result = UserSearchResult(
                            id: friendId,
                            username: friendName,
                            displayName: friend.displayName
                        )
                        onSelect(result)
                    } label: {
                        HStack {
                            Image(systemName: "person.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.tint)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading) {
                                Text(friend.username ?? friendId)
                                    .font(.headline)
                                if let displayName = friend.displayName {
                                    Text(displayName)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Send to \(friend.displayName ?? friend.username ?? friendId)")
                    .accessibilityHint("Selects this friend as the recipient")
                }
                .listStyle(.plain)
                .accessibilityLabel("Friends list")
            } else {
                ContentUnavailableView(
                    "Not Available",
                    systemImage: "person.slash",
                    description: Text("Sign in to send videos to friends.")
                )
                .accessibilityLabel("Not available. Sign in to send videos.")
            }
        }
    }

    // MARK: - Search Results

    private var searchResultsList: some View {
        Group {
            if results.isEmpty {
                ContentUnavailableView(
                    "No Users Found",
                    systemImage: "magnifyingglass",
                    description: Text("Try a different search term.")
                )
                .accessibilityLabel("No users found. Try a different search term.")
            } else {
                List(results) { user in
                    Button {
                        onSelect(user)
                    } label: {
                        HStack {
                            Image(systemName: "person.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.tint)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading) {
                                Text(user.username)
                                    .font(.headline)
                                if let displayName = user.displayName {
                                    Text(displayName)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .accessibilityHidden(true)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Send to \(user.displayName ?? user.username)")
                    .accessibilityHint("Selects this user as the recipient")
                }
                .listStyle(.plain)
                .accessibilityLabel("Search results")
            }
        }
    }

    // MARK: - Actions

    private func loadFriends() async {
        isLoadingFriends = true
        defer { isLoadingFriends = false }
        do {
            friends = try await appState.apiClient.getFriends()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func search() async {
        guard !searchQuery.isEmpty else { return }
        isSearching = true
        defer { isSearching = false }
        do {
            results = try await appState.apiClient.searchUsers(query: searchQuery)
                .filter { $0.id != appState.currentUser?.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
