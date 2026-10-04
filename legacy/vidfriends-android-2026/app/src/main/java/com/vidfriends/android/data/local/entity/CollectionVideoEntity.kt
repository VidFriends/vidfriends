package com.vidfriends.android.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "collection_videos",
    primaryKeys = ["collection_id", "video_id"],
    indices = [Index(value = ["video_id"])],
)
data class CollectionVideoEntity(
    @ColumnInfo(name = "collection_id") val collectionId: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    @ColumnInfo(name = "added_at") val addedAt: String,
)
