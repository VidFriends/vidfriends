package com.vidflow.app.util

import retrofit2.Response

suspend fun <T> safeApiCall(apiCall: suspend () -> Response<T>): Result<T> {
    return try {
        val response = apiCall()
        if (response.isSuccessful) {
            val body = response.body()
            if (body != null) {
                Result.success(body)
            } else {
                Result.failure(Exception("Empty response body"))
            }
        } else {
            val errorMsg = when (response.code()) {
                401 -> "Unauthorized"
                404 -> "Not found"
                409 -> "Conflict"
                422 -> "Validation error"
                in 500..599 -> "Server error"
                else -> "Error ${response.code()}"
            }
            Result.failure(Exception(errorMsg))
        }
    } catch (e: Exception) {
        Result.failure(e)
    }
}
