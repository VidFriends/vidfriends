package com.vidfriends.android.data.remote

import okhttp3.Interceptor
import okhttp3.Response
import java.io.IOException

class ApiErrorInterceptor @javax.inject.Inject constructor() : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response: Response
        try {
            response = chain.proceed(request)
        } catch (e: IOException) {
            throw ApiException("Network error: ${e.message}", cause = e)
        }

        if (!response.isSuccessful) {
            val errorMessage = when (response.code) {
                401 -> "Unauthorized. Please log in again."
                403 -> "Access denied."
                404 -> "Resource not found."
                409 -> "Conflict."
                422 -> "Validation error."
                429 -> "Too many requests. Please try again later."
                in 500..599 -> "Server error. Please try again later."
                else -> "Unexpected error (${response.code})."
            }
            throw ApiException(errorMessage, response.code)
        }

        return response
    }

    class ApiException(
        message: String,
        val code: Int? = null,
        cause: Throwable? = null,
    ) : IOException(message, cause)
}
