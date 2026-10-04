import Foundation
import SwiftData

@Model
final class DownloadedVideo {
    @Attribute(.unique) var videoId: String
    var title: String
    var fileName: String
    var localFileURL: String
    var thumbnailURL: String?
    var duration: String?
    var downloadedAt: Date
    var fileSize: Int64

    init(
        videoId: String,
        title: String,
        fileName: String,
        localFileURL: String,
        thumbnailURL: String? = nil,
        duration: String? = nil,
        downloadedAt: Date = .now,
        fileSize: Int64 = 0
    ) {
        self.videoId = videoId
        self.title = title
        self.fileName = fileName
        self.localFileURL = localFileURL
        self.thumbnailURL = thumbnailURL
        self.duration = duration
        self.downloadedAt = downloadedAt
        self.fileSize = fileSize
    }
}
