package com.vidfriends.app.data.download

import android.app.Service
import android.content.Intent
import android.os.IBinder
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class DownloadService : Service() {

    @Inject lateinit var notificationHelper: DownloadNotificationHelper

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val videoId = intent?.getStringExtra(EXTRA_VIDEO_ID)
        val action = intent?.getStringExtra(EXTRA_ACTION)

        when (action) {
            ACTION_START_FOREGROUND -> {
                startForeground(
                    FOREGROUND_NOTIFICATION_ID,
                    notificationHelper.buildProgressNotification(
                        videoName = intent?.getStringExtra(EXTRA_VIDEO_NAME) ?: "Downloading",
                        progress = 0,
                        isForeground = true,
                    ).build(),
                )
            }
            ACTION_STOP_FOREGROUND -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    companion object {
        const val EXTRA_ACTION = "action"
        const val EXTRA_VIDEO_ID = "video_id"
        const val EXTRA_VIDEO_NAME = "video_name"
        const val ACTION_START_FOREGROUND = "start_foreground"
        const val ACTION_STOP_FOREGROUND = "stop_foreground"
        const val FOREGROUND_NOTIFICATION_ID = 9001
    }
}
