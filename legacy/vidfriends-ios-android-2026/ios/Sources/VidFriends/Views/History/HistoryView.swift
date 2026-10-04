import SwiftUI

struct HistoryView: View {
    @Environment(AppState.self) private var appState

    @State private var entries: [WatchHistoryEntry] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var hasFailedOnce = false
    @State private var searchText = ""

    private var filteredEntries: [WatchHistoryEntry] {
        guard !searchText.isEmpty else { return entries }
        return entries.filter { entry in
            entry.title.localizedCaseInsensitiveContains(searchText)
            || entry.userName.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading history...")
                        .accessibilityLabel("Loading history")
                } else if let error {
                    ContentUnavailableView(
                        "Could Not Load History",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                    .accessibilityLabel("History error: \(error)")
                    .overlay(alignment: .bottom) {
                        if hasFailedOnce {
                            Button {
                                Task { await loadHistory() }
                            } label: {
                                Label("Retry", systemImage: "arrow.clockwise")
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 12)
                            }
                            .buttonStyle(.borderedProminent)
                            .padding(.bottom, 40)
                            .accessibilityLabel("Retry loading history")
                        }
                    }
                } else if entries.isEmpty {
                    ContentUnavailableView(
                        "No Watch History",
                        systemImage: "clock.arrow.circlepath",
                        description: Text("Videos you watch will appear here.")
                    )
                    .accessibilityLabel("No watch history. Videos you watch will appear here.")
                } else if filteredEntries.isEmpty {
                    ContentUnavailableView(
                        "No Results",
                        systemImage: "magnifyingglass",
                        description: Text("No videos match your search.")
                    )
                    .accessibilityLabel("No search results found.")
                } else {
                    List(filteredEntries) { entry in
                        HistoryRowView(entry: entry)
                    }
                    .listStyle(.plain)
                    .accessibilityLabel("Watch history list")
                }
            }
            .navigationTitle("History")
            .searchable(text: $searchText, prompt: "Search by title or friend")
            .task { await loadHistory() }
            .refreshable { await loadHistory() }
        }
    }

    private func loadHistory() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            entries = try await appState.apiClient.getHistory()
            hasFailedOnce = false
        } catch {
            self.error = error.localizedDescription
            hasFailedOnce = true
        }
    }
}

struct HistoryRowView: View {
    let entry: WatchHistoryEntry

    var body: some View {
        HStack(spacing: 12) {
            thumbnail
            details
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(entry.title), from \(entry.userName)")
    }

    @ViewBuilder
    private var thumbnail: some View {
        if let url = entry.thumbnailURL.flatMap({ URL(string: $0) }) {
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
            Text(entry.title)
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(1)
            Text("From: \(entry.userName)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(entry.watchedAt)
                .font(.caption2)
                .foregroundStyle(.tertiary)
            ProgressView(value: min(Double(entry.progressSeconds) / 100.0, 1.0))
                .tint(.secondary)
                .frame(width: 100)
                .accessibilityLabel("Watch progress: \(entry.progressSeconds) seconds")
        }
    }
}

#Preview {
    HistoryView()
        .environment(AppState())
}
