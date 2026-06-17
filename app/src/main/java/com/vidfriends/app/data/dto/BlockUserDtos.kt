package com.vidfriends.app.data.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class BlockedUserDto(
    @Json(name = "id") val id: String,
    @Json(name = "username") val username: String,
    @Json(name = "display_name") val displayName: String?,
    @Json(name = "avatar_url") val avatarUrl: String?,
    @Json(name = "blocked_at") val blockedAt: String,
)

@JsonClass(generateAdapter = true)
data class BlockedUsersResponseDto(
    @Json(name = "users") val users: List<BlockedUserDto>,
    @Json(name = "page") val page: Int,
    @Json(name = "total") val total: Int,
)
