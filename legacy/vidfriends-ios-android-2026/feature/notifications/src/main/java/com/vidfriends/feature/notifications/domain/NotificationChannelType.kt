package com.vidfriends.feature.notifications.domain

import android.app.NotificationManager
import androidx.annotation.StringRes

enum class NotificationChannelType(
    val channelId: String,
    @StringRes val nameRes: Int = 0,
    val importance: Int = NotificationManager.IMPORTANCE_DEFAULT,
) {
    Messages(
        channelId = "vidflow_messages",
        nameRes = 0,
        importance = NotificationManager.IMPORTANCE_HIGH,
    ),
    Followers(
        channelId = "vidflow_followers",
        nameRes = 0,
    ),
    Likes(
        channelId = "vidflow_likes",
        nameRes = 0,
    ),
    Comments(
        channelId = "vidflow_comments",
        nameRes = 0,
    ),
    NewVideos(
        channelId = "vidflow_new_videos",
        nameRes = 0,
        importance = NotificationManager.IMPORTANCE_LOW,
    ),
}
