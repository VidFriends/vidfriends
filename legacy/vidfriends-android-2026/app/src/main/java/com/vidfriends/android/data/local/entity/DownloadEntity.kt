package com.vidfriends.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    @ColumnInfo(name = "file_path") val filePath: String?,
    @ColumnInfo(name = "status") val status: String,
    @ColumnInfo(name = "progress") val progress: Int = 0,
    @ColumnInfo(name = "created_at") val createdAt: String,
)
