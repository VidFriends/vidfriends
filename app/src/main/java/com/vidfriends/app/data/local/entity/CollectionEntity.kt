package com.vidfriends.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "collections")
data class CollectionEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "name") val name: String,
    @ColumnInfo(name = "description") val description: String?,
    @ColumnInfo(name = "video_count") val videoCount: Int,
    @ColumnInfo(name = "created_at") val createdAt: String,
)

@Entity(
    tableName = "collection_videos",
    primaryKeys = ["collection_id", "video_id"],
)
data class CollectionVideoEntity(
    @ColumnInfo(name = "collection_id") val collectionId: String,
    @ColumnInfo(name = "video_id") val videoId: String,
    @ColumnInfo(name = "added_at") val addedAt: String,
)
