package com.vidfriends.feature.notifications.domain

import android.content.Context
import android.content.Intent
import com.vidfriends.feature.notifications.data.WebSocketClient
import com.vidfriends.feature.notifications.service.VidFriendsNotificationService
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PushManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val webSocketClient: WebSocketClient,
) {
    fun startPushService() {
        val intent = VidFriendsNotificationService.startIntent(context)
        context.startForegroundService(intent)
    }

    fun stopPushService() {
        webSocketClient.disconnect()
        val intent = VidFriendsNotificationService.stopIntent(context)
        context.startService(intent)
    }

    fun connectWebSocket(wsUrl: String, token: String) {
        webSocketClient.connect(wsUrl, token)
    }

    fun disconnectWebSocket() {
        webSocketClient.disconnect()
    }
}
