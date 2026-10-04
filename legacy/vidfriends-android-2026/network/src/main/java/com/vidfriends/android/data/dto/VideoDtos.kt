package com.vidfriends.android.data.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class VideoDto(
    @Json(name = "id") val id: String,
    @Json(name = "user_id") val userId: String,
    @Json(name = "username") val username: String,
    @Json(name = "source_url") val sourceUrl: String?,
    @Json(name = "file_path") val filePath: String,
    @Json(name = "thumbnail_path") val thumbnailPath: String?,
    @Json(name = "caption") val caption: String?,
    @Json(name = "duration") val duration: Long,
    @Json(name = "file_size") val fileSize: Long,
    @Json(name = "mime_type") val mimeType: String,
    @Json(name = "is_liked") val isLiked: Boolean,
    @Json(name = "like_count") val likeCount: Int,
    @Json(name = "comment_count") val commentCount: Int,
    @Json(name = "created_at") val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class SendLinkRequestDto(
    @Json(name = "source_url") val sourceUrl: String,
    @Json(name = "caption") val caption: String? = null,
)

@JsonClass(generateAdapter = true)
data class CommentDto(
    @Json(name = "id") val id: String,
    @Json(name = "video_id") val videoId: String,
    @Json(name = "user_id") val userId: String,
    @Json(name = "username") val username: String,
    @Json(name = "text") val text: String,
    @Json(name = "created_at") val createdAt: String,
)

@JsonClass(generateAdapter = true)
data class CommentRequestDto(
    @Json(name = "text") val text: String,
)

@JsonClass(generateAdapter = true)
data class VideoStatusDto(
    @Json(name = "status") val status: String,
)

@JsonClass(generateAdapter = true)
data class FeedResponseDto(
    @Json(name = "videos") val videos: List<VideoDto>,
    @Json(name = "page") val page: Int,
    @Json(name = "total") val total: Int,
)

@JsonClass(generateAdapter = true)
data class HistoryResponseDto(
    @Json(name = "videos") val videos: List<VideoDto>,
    @Json(name = "page") val page: Int,
    @Json(name = "total") val total: Int,
)

@JsonClass(generateAdapter = true)
data class HealthResponseDto(
    @Json(name = "status") val status: String,
)
