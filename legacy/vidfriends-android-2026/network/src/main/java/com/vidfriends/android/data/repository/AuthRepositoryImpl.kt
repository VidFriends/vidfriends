package com.vidfriends.android.data.repository

import com.vidfriends.android.data.dto.RefreshRequestDto
import com.vidfriends.android.data.dto.toDomain
import com.vidfriends.android.data.dto.toDto
import com.vidfriends.android.data.preferences.UserPreferences
import com.vidfriends.android.data.remote.VidFriendsApi
import com.vidfriends.android.domain.model.*
import com.vidfriends.android.domain.repository.AuthRepository
import com.vidfriends.android.util.safeApiCall
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
    private val preferences: UserPreferences,
) : AuthRepository {

    override suspend fun login(request: LoginRequest): ApiResult<AuthResult> {
        val result = safeApiCall { api.login(request.toDto()) }
        return result.fold(
            onSuccess = { response ->
                val authResult = response.toDomain()
                preferences.saveAuthTokens(authResult.accessToken, authResult.refreshToken)
                preferences.saveUserInfo(authResult.userId, authResult.username)
                ApiResult.Success(authResult)
            },
            onFailure = { ApiResult.Error(it.message ?: "Login failed") },
        )
    }

    override suspend fun register(request: RegisterRequest): ApiResult<AuthResult> {
        val result = safeApiCall { api.register(request.toDto()) }
        return result.fold(
            onSuccess = { response ->
                val authResult = response.toDomain()
                preferences.saveAuthTokens(authResult.accessToken, authResult.refreshToken)
                preferences.saveUserInfo(authResult.userId, authResult.username)
                ApiResult.Success(authResult)
            },
            onFailure = { ApiResult.Error(it.message ?: "Registration failed") },
        )
    }

    override suspend fun getCurrentUser(): ApiResult<User> {
        val result = safeApiCall { api.getCurrentUser() }
        return result.fold(
            onSuccess = { ApiResult.Success(it.toDomain()) },
            onFailure = { ApiResult.Error(it.message ?: "Failed to get user") },
        )
    }

    override suspend fun isLoggedIn(): Boolean {
        return preferences.accessToken.firstOrNull() != null
    }

    override suspend fun getAccessToken(): String? {
        return preferences.accessToken.firstOrNull()
    }

    override suspend fun logout() {
        preferences.clear()
    }

    override suspend fun refreshToken(): ApiResult<AuthResult> {
        val currentRefreshToken = preferences.refreshToken.firstOrNull()
            ?: return ApiResult.Error("No refresh token available")

        val result = safeApiCall {
            api.refreshToken(RefreshRequestDto(refreshToken = currentRefreshToken))
        }
        return result.fold(
            onSuccess = { response ->
                val authResult = response.toDomain()
                preferences.saveAuthTokens(authResult.accessToken, authResult.refreshToken)
                ApiResult.Success(authResult)
            },
            onFailure = {
                preferences.clear()
                ApiResult.Error(it.message ?: "Session expired")
            },
        )
    }
}
