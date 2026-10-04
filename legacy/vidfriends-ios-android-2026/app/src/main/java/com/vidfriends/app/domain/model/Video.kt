package com.vidfriends.app.domain.model

data class Video(
    val id: String,
    val userId: String,
    val username: String,
    val sourceUrl: String?,
    val filePath: String,
    val thumbnailPath: String?,
    val caption: String?,
    val duration: Long,
    val fileSize: Long,
    val mimeType: String,
    val isLiked: Boolean,
    val likeCount: Int,
    val commentCount: Int,
    val createdAt: String,
    val isDuplicate: Boolean = false,
    val duplicateOf: String? = null,
)
