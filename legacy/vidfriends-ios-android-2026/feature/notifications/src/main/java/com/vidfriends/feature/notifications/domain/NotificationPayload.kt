package com.vidfriends.feature.notifications.domain

data class NotificationPayload(
    val type: String,
    val title: String,
    val body: String,
    val videoId: String?,
    val userId: String?,
    val deepLink: String?,
) {
    fun channelType(): NotificationChannelType = when (type) {
        "new_message" -> NotificationChannelType.Messages
        "new_follower" -> NotificationChannelType.Followers
        "new_like" -> NotificationChannelType.Likes
        "new_comment" -> NotificationChannelType.Comments
        "new_video" -> NotificationChannelType.NewVideos
        else -> NotificationChannelType.Messages
    }
}
