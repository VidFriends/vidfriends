import SwiftUI

struct CommentsView: View {
    let videoId: String

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var comments: [Comment] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var newCommentBody = ""
    @State private var isPosting = false
    @State private var hasFailedOnce = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if isLoading {
                    Spacer()
                    ProgressView("Loading comments...")
                        .accessibilityLabel("Loading comments")
                    Spacer()
                } else if let error {
                    Spacer()
                    ContentUnavailableView(
                        "Could Not Load Comments",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                    .accessibilityLabel("Comments error: \(error)")
                    .overlay(alignment: .bottom) {
                        if hasFailedOnce {
                            Button {
                                Task { await loadComments() }
                            } label: {
                                Label("Retry", systemImage: "arrow.clockwise")
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 12)
                            }
                            .buttonStyle(.borderedProminent)
                            .padding(.bottom, 40)
                            .accessibilityLabel("Retry loading comments")
                        }
                    }
                    Spacer()
                } else if comments.isEmpty {
                    Spacer()
                    ContentUnavailableView(
                        "No Comments Yet",
                        systemImage: "bubble.left",
                        description: Text("Be the first to comment!")
                    )
                    .accessibilityLabel("No comments yet. Be the first to comment.")
                    Spacer()
                } else {
                    commentsList
                }

                commentInputBar
            }
            .navigationTitle("Comments")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityLabel("Close comments")
                }
            }
            .task { await loadComments() }
        }
    }

    private var commentsList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                ForEach(comments) { comment in
                    CommentRowView(comment: comment)
                }
            }
            .padding()
        }
        .refreshable { await loadComments() }
        .accessibilityLabel("Comments list")
    }

    private var commentInputBar: some View {
        HStack(spacing: 8) {
            TextField("Add a comment...", text: $newCommentBody)
                .textFieldStyle(.roundedBorder)
                .autocapitalization(.sentences)
                .disableAutocorrection(true)
                .disabled(isPosting)
                .accessibilityLabel("Comment input")
                .accessibilityHint("Type your comment here")

            Button {
                Task { await postComment() }
            } label: {
                if isPosting {
                    ProgressView()
                        .tint(.white)
                        .frame(width: 32, height: 32)
                        .accessibilityHidden(true)
                } else {
                    Image(systemName: "paperplane.fill")
                        .font(.body)
                        .foregroundStyle(newCommentBody.trimmingCharacters(in: .whitespaces).isEmpty ? .secondary : .accentColor)
                        .frame(width: 32, height: 32)
                }
            }
            .disabled(newCommentBody.trimmingCharacters(in: .whitespaces).isEmpty || isPosting)
            .accessibilityLabel("Post comment")
            .accessibilityHint("Sends your comment")
        }
        .padding()
        .background(.regularMaterial)
    }

    private func loadComments() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            comments = try await appState.apiClient.getComments(videoId: videoId)
            hasFailedOnce = false
        } catch {
            self.error = error.localizedDescription
            hasFailedOnce = true
        }
    }

    private func postComment() async {
        let body = newCommentBody.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty else { return }
        isPosting = true
        defer { isPosting = false }
        do {
            let response = try await appState.apiClient.postComment(videoId: videoId, body: body, parentId: nil)
            let comment = Comment(
                id: response.id,
                userId: appState.currentUser?.id ?? "",
                userName: appState.currentUser?.displayName ?? appState.currentUser?.username,
                videoId: videoId,
                parentId: nil,
                body: body,
                createdAt: response.createdAt
            )
            comments.append(comment)
            newCommentBody = ""
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct CommentRowView: View {
    let comment: Comment

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "person.circle.fill")
                .font(.title3)
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(comment.userName ?? "Anonymous")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                    Text(comment.createdAt)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                Text(comment.body)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(comment.userName ?? "Anonymous"): \(comment.body)")
    }
}
