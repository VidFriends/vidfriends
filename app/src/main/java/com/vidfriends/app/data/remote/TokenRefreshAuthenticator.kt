package com.vidfriends.app.data.remote

import com.squareup.moshi.Moshi
import com.vidfriends.app.data.preferences.UserPreferences
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TokenRefreshAuthenticator @Inject constructor(
    private val userPreferences: UserPreferences,
    private val moshi: Moshi,
) : Authenticator {

    private val refreshClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val refreshMutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.code != 401) return null

        val refreshResult = runBlocking {
            refreshMutex.withLock {
                val refreshToken = userPreferences.refreshToken.firstOrNull()
                    ?: return@withLock null

                val serverUrl = userPreferences.serverUrl.firstOrNull()
                    ?: "http://localhost:3100"

                try {
                    val requestBody = moshi.adapter(RefreshRequest::class.java)
                        .toJson(RefreshRequest(refreshToken))

                    val refreshRequest = Request.Builder()
                        .url("${serverUrl.trimEnd('/')}/api/auth/refresh")
                        .post(requestBody.toRequestBody("application/json".toMediaType()))
                        .build()

                    val refreshResponse = refreshClient.newCall(refreshRequest).execute()
                    val body = refreshResponse.body?.string()

                    if (refreshResponse.isSuccessful && body != null) {
                        val adapter = moshi.adapter(TokenRefreshResponse::class.java)
                        val tokenResponse = adapter.fromJson(body)
                        if (tokenResponse != null) {
                            userPreferences.saveAuthTokens(
                                tokenResponse.accessToken,
                                tokenResponse.refreshToken ?: refreshToken
                            )
                            tokenResponse.accessToken
                        } else {
                            userPreferences.clear()
                            null
                        }
                    } else {
                        userPreferences.clear()
                        null
                    }
                } catch (e: Exception) {
                    userPreferences.clear()
                    null
                }
            }
        }

        return refreshResult?.let { newToken ->
            response.request.newBuilder()
                .header("Authorization", "Bearer $newToken")
                .build()
        }
    }

    private data class RefreshRequest(
        val refreshToken: String,
    )

    private data class TokenRefreshResponse(
        val accessToken: String,
        val refreshToken: String? = null,
    )
}
