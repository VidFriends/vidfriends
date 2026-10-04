import Foundation
import SwiftData

@Observable
final class DownloadService {
    private let apiClient: APIClientProtocol
    private let modelContext: ModelContext
    private let fileManager = FileManager.default

    private var downloadsDirectory: URL {
        let paths = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
        let dir = paths[0].appendingPathComponent("Downloads", isDirectory: true)
        if !fileManager.fileExists(atPath: dir.path) {
            try? fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    init(apiClient: APIClientProtocol, modelContext: ModelContext) {
        self.apiClient = apiClient
        self.modelContext = modelContext
    }

    func downloadVideo(videoId: String, title: String, thumbnailURL: String?, duration: String?) async throws {
        let response = try await apiClient.downloadVideo(id: videoId)
        let fileName = response.fileName ?? "\(videoId).mp4"
        let localURL = downloadsDirectory.appendingPathComponent(fileName)

        guard let sourceURL = URL(string: response.url) else {
            throw DownloadError.invalidDownloadURL
        }

        let (data, _) = try await URLSession.shared.data(from: sourceURL)
        try data.write(to: localURL)

        let model = DownloadedVideo(
            videoId: videoId,
            title: title,
            fileName: fileName,
            localFileURL: localURL.path,
            thumbnailURL: thumbnailURL,
            duration: duration,
            fileSize: Int64(data.count)
        )
        modelContext.insert(model)
        try modelContext.save()
    }

    func deleteDownload(_ video: DownloadedVideo) {
        let fileURL = URL(filePath: video.localFileURL)
        try? fileManager.removeItem(at: fileURL)
        modelContext.delete(video)
        try? modelContext.save()
    }

    func downloadedVideos() -> [DownloadedVideo] {
        let descriptor = FetchDescriptor<DownloadedVideo>(
            sortBy: [SortDescriptor(\.downloadedAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    func isVideoDownloaded(_ videoId: String) -> Bool {
        let predicate = #Predicate<DownloadedVideo> { $0.videoId == videoId }
        let descriptor = FetchDescriptor<DownloadedVideo>(predicate: predicate)
        return (try? modelContext.fetchCount(descriptor)) ?? 0 > 0
    }

    func videoSizeString(_ video: DownloadedVideo) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: video.fileSize)
    }
}

enum DownloadError: LocalizedError {
    case invalidDownloadURL

    var errorDescription: String? {
        switch self {
        case .invalidDownloadURL: return "Invalid download URL from server."
        }
    }
}
