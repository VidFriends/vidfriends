package com.vidfriends.feature.notifications.data

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class NotificationPayloadDto(
    @Json(name = "type") val type: String,
    @Json(name = "title") val title: String,
    @Json(name = "body") val body: String,
    @Json(name = "video_id") val videoId: String?,
    @Json(name = "user_id") val userId: String?,
    @Json(name = "deep_link") val deepLink: String?,
)
