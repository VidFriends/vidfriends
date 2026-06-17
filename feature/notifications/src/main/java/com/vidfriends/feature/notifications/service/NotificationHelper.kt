package com.vidfriends.feature.notifications.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.vidfriends.feature.notifications.data.NotificationPrefs
import com.vidfriends.feature.notifications.domain.NotificationChannelType
import com.vidfriends.feature.notifications.domain.NotificationPayload
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context,
    private val notificationPrefs: NotificationPrefs,
) {
    companion object {
        private const val FOREGROUND_NOTIFICATION_ID = 1
        private const val PUSH_NOTIFICATION_BASE_ID = 1000
    }

    fun createNotificationChannels() {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channels = listOf(
            NotificationChannelType.Messages,
            NotificationChannelType.Followers,
            NotificationChannelType.Likes,
            NotificationChannelType.Comments,
            NotificationChannelType.NewVideos,
        )
        channels.forEach { type ->
            val channel = NotificationChannel(
                type.channelId,
                channelDisplayName(type),
                type.importance,
            ).apply {
                description = "${channelDisplayName(type)} notifications"
            }
            manager.createNotificationChannel(channel)
        }
    }

    private fun channelDisplayName(type: NotificationChannelType): String = when (type) {
        NotificationChannelType.Messages -> "Messages"
        NotificationChannelType.Followers -> "Followers"
        NotificationChannelType.Likes -> "Likes"
        NotificationChannelType.Comments -> "Comments"
        NotificationChannelType.NewVideos -> "New Videos"
    }

    fun buildForegroundNotification(): android.app.Notification {
        return NotificationCompat.Builder(context, NotificationChannelType.Messages.channelId)
            .setContentTitle("VidFriends")
            .setContentText("Connected for notifications")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    suspend fun showNotification(payload: NotificationPayload, pendingIntent: PendingIntent?) {
        val channel = payload.channelType()
        val enabled = notificationPrefs.isChannelEnabled(channel).firstOrNull() ?: true
        if (!enabled) return

        val notification = NotificationCompat.Builder(context, channel.channelId)
            .setContentTitle(payload.title)
            .setContentText(payload.body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(priorityForChannel(channel))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val notificationId = PUSH_NOTIFICATION_BASE_ID + payload.hashCode()
        NotificationManagerCompat.from(context).notify(notificationId, notification)
    }

    private fun priorityForChannel(type: NotificationChannelType): Int = when (type) {
        NotificationChannelType.Messages -> NotificationCompat.PRIORITY_HIGH
        NotificationChannelType.Followers -> NotificationCompat.PRIORITY_DEFAULT
        NotificationChannelType.Likes -> NotificationCompat.PRIORITY_DEFAULT
        NotificationChannelType.Comments -> NotificationCompat.PRIORITY_DEFAULT
        NotificationChannelType.NewVideos -> NotificationCompat.PRIORITY_LOW
    }
}
