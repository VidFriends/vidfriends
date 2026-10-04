package com.vidfriends.app

import android.app.Application
import com.vidfriends.app.data.download.DownloadManager
import com.vidfriends.app.data.repository.DownloadRepositoryImpl
import com.vidfriends.feature.notifications.service.NotificationHelper
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class VidFriendsApp : Application() {

    @Inject lateinit var notificationHelper: NotificationHelper

    @Inject lateinit var downloadManager: DownloadManager

    @Inject lateinit var downloadRepository: DownloadRepositoryImpl

    override fun onCreate() {
        super.onCreate()
        notificationHelper.createNotificationChannels()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_RUNNING_CRITICAL) {
            downloadManager.destroy()
        }
    }

    override fun onTerminate() {
        downloadManager.destroy()
        downloadRepository.cleanup()
        super.onTerminate()
    }
}
