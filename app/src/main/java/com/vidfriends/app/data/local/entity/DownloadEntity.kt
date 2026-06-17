package com.vidfriends.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    @ColumnInfo(name = "local_path") val localPath: String?,
    @ColumnInfo(name = "status") val status: String,
    @ColumnInfo(name = "progress") val progress: Int,
    @ColumnInfo(name = "downloaded_at") val downloadedAt: Long?,
    @ColumnInfo(name = "file_size") val fileSize: Long,
    @ColumnInfo(name = "mime_type") val mimeType: String,
)
