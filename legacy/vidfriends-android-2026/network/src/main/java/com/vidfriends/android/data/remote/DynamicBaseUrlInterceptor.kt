package com.vidfriends.android.data.remote

import com.vidfriends.android.data.preferences.UserPreferences
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class DynamicBaseUrlInterceptor @Inject constructor(
    private val userPreferences: UserPreferences,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val serverUrl = runBlocking {
            userPreferences.serverUrl.firstOrNull()
        }

        val originalRequest = chain.request()
        if (serverUrl.isNullOrBlank()) {
            return chain.proceed(originalRequest)
        }

        val baseUrl = serverUrl.toHttpUrlOrNull() ?: return chain.proceed(originalRequest)

        val newUrl = originalRequest.url.newBuilder()
            .scheme(baseUrl.scheme)
            .host(baseUrl.host)
            .port(baseUrl.port)
            .build()

        val newRequest = originalRequest.newBuilder()
            .url(newUrl)
            .build()

        return chain.proceed(newRequest)
    }
}
