package com.vidfriends.feature.notifications.service

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.vidfriends.feature.notifications.data.WebSocketClient
import com.vidfriends.feature.notifications.domain.NotificationPayload
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val webSocketClient: WebSocketClient,
    private val notificationHelper: NotificationHelper,
) {
    private var scope: CoroutineScope? = null
    private var isListening = false

    fun startListening(serviceContext: Context) {
        if (isListening) return
        isListening = true
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        scope!!.launch {
            webSocketClient.notifications().collect { payload ->
                val pendingIntent = createDeepLinkIntent(payload, serviceContext)
                notificationHelper.showNotification(payload, pendingIntent)
            }
        }
    }

    fun stopListening() {
        isListening = false
        scope?.cancel()
        scope = null
    }

    private fun createDeepLinkIntent(
        payload: NotificationPayload,
        serviceContext: Context,
    ): PendingIntent? {
        val targetClass = try {
            Class.forName("com.vidfriends.app.MainActivity")
        } catch (e: ClassNotFoundException) {
            return null
        }

        val intent = Intent(serviceContext, targetClass).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("deep_link", payload.deepLink)
            putExtra("notification_type", payload.type)
            putExtra("video_id", payload.videoId)
            putExtra("user_id", payload.userId)
        }

        return PendingIntent.getActivity(
            serviceContext,
            payload.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
