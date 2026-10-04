package com.vidfriends.app.domain.model

enum class DownloadStatus {
    PENDING,
    DOWNLOADING,
    PAUSED,
    COMPLETED,
    FAILED,
}

data class Download(
    val id: String,
    val videoId: String,
    val localPath: String?,
    val status: DownloadStatus,
    val progress: Int,
    val downloadedAt: Long?,
    val fileSize: Long,
    val mimeType: String,
)

data class StorageInfo(
    val availableBytes: Long,
    val usedBytes: Long,
    val totalBytes: Long,
)
