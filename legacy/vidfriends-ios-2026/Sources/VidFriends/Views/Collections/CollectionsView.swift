import SwiftUI

struct CollectionsView: View {
    @Environment(AppState.self) private var appState

    @State private var collections: [Collection] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var hasFailedOnce = false
    @State private var showNewCollection = false
    @State private var newCollectionName = ""

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading collections...")
                        .accessibilityLabel("Loading collections")
                } else if let error {
                    ContentUnavailableView(
                        "Could Not Load Collections",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                    .accessibilityLabel("Collections error: \(error)")
                    .overlay(alignment: .bottom) {
                        if hasFailedOnce {
                            Button {
                                Task { await loadCollections() }
                            } label: {
                                Label("Retry", systemImage: "arrow.clockwise")
                                    .padding(.horizontal, 24)
                                    .padding(.vertical, 12)
                            }
                            .buttonStyle(.borderedProminent)
                            .padding(.bottom, 40)
                            .accessibilityLabel("Retry loading collections")
                        }
                    }
                } else if collections.isEmpty {
                    ContentUnavailableView(
                        "No Collections",
                        systemImage: "folder",
                        description: Text("Create a collection to organize your videos.")
                    )
                    .accessibilityLabel("No collections. Create a collection to organize your videos.")
                } else {
                    List {
                        Section {
                            ForEach(collections) { collection in
                                NavigationLink(destination: CollectionDetailView(collection: collection)) {
                                    CollectionRowView(collection: collection)
                                }
                                .accessibilityLabel("Collection: \(collection.name)")
                            }
                            .onDelete(perform: deleteCollections)
                        } header: {
                            HStack {
                                Text("My Collections")
                                    .accessibilityAddTraits(.isHeader)
                                Spacer()
                                Button("New", systemImage: "plus") {
                                    showNewCollection = true
                                }
                                .font(.subheadline)
                                .accessibilityLabel("New collection")
                                .accessibilityHint("Creates a new collection to organize videos")
                            }
                        }
                    }
                    .listStyle(.plain)
                    .accessibilityLabel("Collections list")
                }
            }
            .navigationTitle("Collections")
            .task { await loadCollections() }
            .refreshable { await loadCollections() }
            .alert("New Collection", isPresented: $showNewCollection) {
                TextField("Collection Name", text: $newCollectionName)
                    .accessibilityLabel("Collection name")
                Button("Create") { Task { await createCollection() } }
                    .accessibilityLabel("Create collection")
                Button("Cancel", role: .cancel) {}
                    .accessibilityLabel("Cancel")
            } message: {
                Text("Enter a name for the new collection.")
            }
        }
    }

    private func loadCollections() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            collections = try await appState.apiClient.getCollections()
            hasFailedOnce = false
        } catch {
            self.error = error.localizedDescription
            hasFailedOnce = true
        }
    }

    private func createCollection() async {
        guard !newCollectionName.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        do {
            let collection = try await appState.apiClient.createCollection(name: newCollectionName.trimmingCharacters(in: .whitespaces))
            collections.insert(collection, at: 0)
            newCollectionName = ""
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteCollections(at offsets: IndexSet) {
        for index in offsets {
            let collection = collections[index]
            Task {
                do {
                    try await appState.apiClient.deleteCollection(id: collection.id)
                    await loadCollections()
                } catch {
                    self.error = error.localizedDescription
                }
            }
        }
    }
}

struct CollectionRowView: View {
    let collection: Collection

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "folder.fill")
                .font(.title2)
                .foregroundStyle(.tint)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(collection.name)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(1)
                if let count = collection.videoCount {
                    Text("\(count) video\(count == 1 ? "" : "s")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(collection.name)\(collection.videoCount.map { ", \($0) videos" } ?? "")")
    }
}

// MARK: - Collection Detail

struct CollectionDetailView: View {
    @Environment(AppState.self) private var appState
    let collection: Collection

    @State private var videos: [VideoWithUser] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var hasFailedOnce = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading videos...")
                    .accessibilityLabel("Loading videos")
            } else if let error {
                ContentUnavailableView(
                    "Could Not Load Videos",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
                .accessibilityLabel("Videos error: \(error)")
                .overlay(alignment: .bottom) {
                    if hasFailedOnce {
                        Button {
                            Task { await loadVideos() }
                        } label: {
                            Label("Retry", systemImage: "arrow.clockwise")
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                        }
                        .buttonStyle(.borderedProminent)
                        .padding(.bottom, 40)
                        .accessibilityLabel("Retry loading videos")
                    }
                }
            } else if videos.isEmpty {
                ContentUnavailableView(
                    "Empty Collection",
                    systemImage: "folder",
                    description: Text("No videos in this collection yet.")
                )
                .accessibilityLabel("Empty collection. No videos in this collection yet.")
            } else {
                List(videos) { video in
                    VideoCollectionRowView(video: video)
                }
                .listStyle(.plain)
                .accessibilityLabel("Collection videos")
            }
        }
        .navigationTitle(collection.name)
        .task { await loadVideos() }
        .refreshable { await loadVideos() }
    }

    private func loadVideos() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            videos = try await appState.apiClient.getCollectionVideos(id: collection.id)
            hasFailedOnce = false
        } catch {
            self.error = error.localizedDescription
            hasFailedOnce = true
        }
    }
}

struct VideoCollectionRowView: View {
    let video: VideoWithUser

    var body: some View {
        HStack(spacing: 12) {
            thumbnail
            details
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(video.title)\(video.userName.map { ", by \($0)" } ?? "")")
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
                    Image(systemName: "video.fill")
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
            if let userName = video.userName {
                Text(userName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    CollectionsView()
        .environment(AppState())
}
