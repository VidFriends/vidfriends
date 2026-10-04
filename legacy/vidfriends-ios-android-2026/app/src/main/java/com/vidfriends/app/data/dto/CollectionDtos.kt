package com.vidfriends.app.data.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class CollectionDto(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "description") val description: String?,
    @Json(name = "video_count") val videoCount: Int,
    @Json(name = "created_at") val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class CreateCollectionRequestDto(
    @Json(name = "name") val name: String,
    @Json(name = "description") val description: String? = null,
)

@JsonClass(generateAdapter = true)
data class UpdateCollectionRequestDto(
    @Json(name = "name") val name: String? = null,
    @Json(name = "description") val description: String? = null,
)

@JsonClass(generateAdapter = true)
data class AddCollectionVideoRequestDto(
    @Json(name = "video_id") val videoId: String,
)

@JsonClass(generateAdapter = true)
data class CollectionVideoDto(
    @Json(name = "id") val id: String,
    @Json(name = "collection_id") val collectionId: String,
    @Json(name = "video_id") val videoId: String,
    @Json(name = "added_at") val addedAt: String,
    @Json(name = "video") val video: VideoDto? = null,
)
