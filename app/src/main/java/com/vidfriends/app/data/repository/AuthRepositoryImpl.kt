package com.vidfriends.app.data.repository

import com.vidfriends.app.data.dto.PushRegisterRequestDto
import com.vidfriends.app.data.dto.RefreshRequestDto
import com.vidfriends.app.data.dto.UpdateUserRequestDto
import com.vidfriends.app.data.dto.toDomain
import com.vidfriends.app.data.local.dao.UserDao
import com.vidfriends.app.data.local.toDomain
import com.vidfriends.app.data.local.toEntity
import com.vidfriends.app.data.preferences.UserPreferences
import com.vidfriends.app.data.remote.VidFriendsApi
import com.vidfriends.app.domain.model.*
import com.vidfriends.app.domain.repository.AuthRepository
import com.vidfriends.app.util.safeApiCall
import com.vidfriends.feature.notifications.domain.PushManager
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
    private val preferences: UserPreferences,
    private val userDao: UserDao,
    private val pushManager: PushManager,
) : AuthRepository {

    override suspend fun login(request: LoginRequest): ApiResult<AuthResult> {
        val result = safeApiCall { api.login(request.toDto()) }
        return result.fold(
            onSuccess = { response ->
                val authResult = response.toDomain()
                preferences.saveAuthTokens(authResult.accessToken, authResult.refreshToken)
                preferences.saveUserInfo(authResult.userId, authResult.username)
                registerForPush(authResult.accessToken)
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
                registerForPush(authResult.accessToken)
                ApiResult.Success(authResult)
            },
            onFailure = { ApiResult.Error(it.message ?: "Registration failed") },
        )
    }

    private suspend fun registerForPush(accessToken: String) {
        try {
            val serverUrl = preferences.serverUrl.firstOrNull() ?: return
            val deviceId = preferences.getOrCreateDeviceId()
            val result = safeApiCall { api.registerPush(PushRegisterRequestDto(deviceId = deviceId)) }
            result.fold(
                onSuccess = { response ->
                    val wsBase = serverUrl.trimEnd('/')
                        .replace("http://", "ws://")
                        .replace("https://", "wss://")
                    val wsUrl = response.wsUrl ?: "$wsBase/ws"
                    pushManager.connectWebSocket(wsUrl, accessToken)
                    pushManager.startPushService()
                },
                onFailure = { /* push registration failed, log silently */ },
            )
        } catch (_: Exception) { }
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
        try {
            safeApiCall { api.unregisterPush() }
        } catch (_: Exception) { }
        pushManager.stopPushService()
        preferences.clear()
    }

    override suspend fun updateUser(displayName: String?, avatarUrl: String?): ApiResult<User> {
        val result = safeApiCall {
            api.updateCurrentUser(UpdateUserRequestDto(displayName = displayName, avatarUrl = avatarUrl))
        }
        return result.fold(
            onSuccess = { dto ->
                val user = dto.toDomain()
                userDao.insert(user.toEntity())
                ApiResult.Success(user)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to update user") },
        )
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
