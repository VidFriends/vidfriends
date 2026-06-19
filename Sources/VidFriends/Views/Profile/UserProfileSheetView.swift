import SwiftUI

struct UserProfileSheetView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    let userId: String
    let userName: String
    let displayName: String?

    @State private var isBlocked = false
    @State private var showBlockConfirmation = false
    @State private var showUnblockConfirmation = false
    @State private var showError = false
    @State private var errorMessage = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "person.circle.fill")
                    .font(.system(size: 80))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)

                VStack(spacing: 4) {
                    Text(displayName ?? userName)
                        .font(.title2)
                        .fontWeight(.bold)
                    if displayName != nil {
                        Text("@\(userName)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("User: \(displayName ?? userName)")

                Spacer()

                VStack(spacing: 12) {
                    if isBlocked {
                        Button(role: .destructive) {
                            showUnblockConfirmation = true
                        } label: {
                            Label("Unblock User", systemImage: "hand.raised.slash")
                                .frame(maxWidth: .infinity)
                                .padding()
                        }
                        .buttonStyle(.bordered)
                        .tint(.red)
                        .accessibilityLabel("Unblock \(displayName ?? userName)")
                    } else {
                        Button(role: .destructive) {
                            showBlockConfirmation = true
                        } label: {
                            Label("Block User", systemImage: "hand.raised")
                                .frame(maxWidth: .infinity)
                                .padding()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                        .accessibilityLabel("Block \(displayName ?? userName)")
                    }
                }
                .padding(.horizontal)
            }
            .padding(.bottom, 40)
            .navigationTitle("User")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityLabel("Done")
                }
            }
            .task {
                isBlocked = appState.blockedUserIds.contains(userId)
            }
            .alert("Block User", isPresented: $showBlockConfirmation) {
                Button("Block", role: .destructive) {
                    Task { await block() }
                }
                .accessibilityLabel("Confirm block")
                Button("Cancel", role: .cancel) {}
                    .accessibilityLabel("Cancel block")
            } message: {
                Text("\(displayName ?? userName) will not be able to send you videos or see your content.")
            }
            .alert("Unblock User", isPresented: $showUnblockConfirmation) {
                Button("Unblock", role: .destructive) {
                    Task { await unblock() }
                }
                .accessibilityLabel("Confirm unblock")
                Button("Cancel", role: .cancel) {}
                    .accessibilityLabel("Cancel unblock")
            } message: {
                Text("\(displayName ?? userName) will be able to send you videos again.")
            }
            .alert("Error", isPresented: $showError) {
                Button("OK") {}
            } message: {
                Text(errorMessage)
            }
        }
    }

    private func block() async {
        do {
            try await appState.apiClient.blockUser(id: userId)
            isBlocked = true
            await appState.loadBlockedUserIds()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }

    private func unblock() async {
        do {
            try await appState.apiClient.unblockUser(id: userId)
            isBlocked = false
            await appState.loadBlockedUserIds()
        } catch {
            errorMessage = error.localizedDescription
            showError = true
        }
    }
}

#Preview {
    UserProfileSheetView(
        userId: "u2",
        userName: "bob",
        displayName: "Bob Smith"
    )
}
