package com.vidfriends.feature.notifications.service

import android.app.PendingIntent
import android.content.Intent
import androidx.lifecycle.LifecycleService
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class VidFriendsNotificationService : LifecycleService() {

    @Inject lateinit var notificationHelper: NotificationHelper

    @Inject lateinit var notificationManager: NotificationManager

    override fun onCreate() {
        super.onCreate()
        notificationHelper.createNotificationChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        when (intent?.action) {
            ACTION_START -> {
                val notification = notificationHelper.buildForegroundNotification()
                startForeground(NOTIFICATION_ID, notification)
                notificationManager.startListening(this)
            }
            ACTION_STOP -> {
                notificationManager.stopListening()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }

        return START_STICKY
    }

    companion object {
        const val NOTIFICATION_ID = 1
        const val ACTION_START = "com.vidfriends.feature.notifications.START"
        const val ACTION_STOP = "com.vidfriends.feature.notifications.STOP"

        fun startIntent(context: android.content.Context): Intent {
            return Intent(context, VidFriendsNotificationService::class.java).apply {
                action = ACTION_START
            }
        }

        fun stopIntent(context: android.content.Context): Intent {
            return Intent(context, VidFriendsNotificationService::class.java).apply {
                action = ACTION_STOP
            }
        }
    }
}
