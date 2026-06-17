package com.vidfriends.feature.notifications.data

import com.squareup.moshi.Moshi
import com.vidfriends.feature.notifications.domain.NotificationPayload
import android.util.Log
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WebSocketClient @Inject constructor(
    private val moshi: Moshi,
) {
    private var webSocket: WebSocket? = null
    private var shouldReconnect = false
    private val maxRetryDelay = 30000L
    private val baseRetryDelay = 1000L

    private val _connectionState = Channel<ConnectionState>(Channel.CONFLATED)
    val connectionState: Channel<ConnectionState> = _connectionState

    private val _messages = Channel<NotificationPayload>(Channel.BUFFERED)
    val messages: Channel<NotificationPayload> = _messages

    private val jsonAdapter = moshi.adapter(NotificationPayloadDto::class.java)

    fun connect(wsUrl: String, token: String) {
        shouldReconnect = true
        doConnect(wsUrl, token)
    }

    private fun doConnect(wsUrl: String, token: String) {
        val client = OkHttpClient.Builder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()

        val request = Request.Builder()
            .url(wsUrl)
            .addHeader("Authorization", "Bearer $token")
            .build()

        _connectionState.trySend(ConnectionState.Connecting)

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                retryCount = 0
                _connectionState.trySend(ConnectionState.Connected)
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val dto = jsonAdapter.fromJson(text)
                    if (dto != null) {
                        val payload = NotificationPayload(
                            type = dto.type,
                            title = dto.title,
                            body = dto.body,
                            videoId = dto.videoId,
                            userId = dto.userId,
                            deepLink = dto.deepLink,
                        )
                        _messages.trySend(payload)
                    }
                } catch (e: Exception) {
                    Log.e("WebSocketClient", "Failed to parse notification payload", e)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _connectionState.trySend(ConnectionState.Disconnected)
                if (shouldReconnect) {
                    scheduleReconnect(wsUrl, token)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _connectionState.trySend(ConnectionState.Disconnected)
                if (shouldReconnect) {
                    scheduleReconnect(wsUrl, token)
                }
            }
        })
    }

    private var retryCount = 0

    private fun scheduleReconnect(wsUrl: String, token: String) {
        val delay = (baseRetryDelay * (1 shl retryCount.coerceAtMost(5)))
            .coerceAtMost(maxRetryDelay)
        retryCount++
        Thread {
            Thread.sleep(delay)
            if (shouldReconnect) {
                doConnect(wsUrl, token)
            }
        }.start()
    }

    fun disconnect() {
        shouldReconnect = false
        retryCount = 0
        webSocket?.close(1000, "User logged out")
        webSocket = null
        _connectionState.trySend(ConnectionState.Disconnected)
    }

    fun notifications(): Flow<NotificationPayload> = _messages.receiveAsFlow()

    sealed class ConnectionState {
        data object Connecting : ConnectionState()
        data object Connected : ConnectionState()
        data object Disconnected : ConnectionState()
    }
}
