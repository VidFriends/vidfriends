package com.vidfriends.app.data.local

import com.vidfriends.app.data.local.entity.DownloadEntity
import com.vidfriends.app.domain.model.Download
import com.vidfriends.app.domain.model.DownloadStatus

fun DownloadEntity.toDomain(): Download = Download(
    id = id,
    videoId = videoId,
    localPath = localPath,
    status = DownloadStatus.valueOf(status),
    progress = progress,
    downloadedAt = downloadedAt,
    fileSize = fileSize,
    mimeType = mimeType,
)

fun Download.toEntity(): DownloadEntity = DownloadEntity(
    id = id,
    videoId = videoId,
    localPath = localPath,
    status = status.name,
    progress = progress,
    downloadedAt = downloadedAt,
    fileSize = fileSize,
    mimeType = mimeType,
)
