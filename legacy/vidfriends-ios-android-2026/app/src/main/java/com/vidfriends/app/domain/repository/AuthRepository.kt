package com.vidfriends.app.domain.repository

import com.vidfriends.app.domain.model.*

interface AuthRepository {
    suspend fun login(request: LoginRequest): ApiResult<AuthResult>
    suspend fun register(request: RegisterRequest): ApiResult<AuthResult>
    suspend fun getCurrentUser(): ApiResult<User>
    suspend fun isLoggedIn(): Boolean
    suspend fun getAccessToken(): String?
    suspend fun logout()
    suspend fun refreshToken(): ApiResult<AuthResult>
    suspend fun updateUser(displayName: String?, avatarUrl: String?): ApiResult<User>
}
