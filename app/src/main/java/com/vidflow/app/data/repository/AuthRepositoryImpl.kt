package com.vidflow.app.data.repository

import com.vidflow.app.data.dto.RefreshRequestDto
import com.vidflow.app.data.dto.UpdateUserRequestDto
import com.vidflow.app.data.dto.toDomain
import com.vidflow.app.data.local.dao.UserDao
import com.vidflow.app.data.local.toDomain
import com.vidflow.app.data.local.toEntity
import com.vidflow.app.data.preferences.UserPreferences
import com.vidflow.app.data.remote.VidFriendsApi
import com.vidflow.app.domain.model.*
import com.vidflow.app.domain.repository.AuthRepository
import com.vidflow.app.util.safeApiCall
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
    private val preferences: UserPreferences,
    private val userDao: UserDao,
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
