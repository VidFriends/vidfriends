package com.vidfriends.app.data.repository

import com.vidfriends.app.data.dto.toDomain
import com.vidfriends.app.data.remote.VidFriendsApi
import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.BlockedUser
import com.vidfriends.app.domain.repository.BlockUserRepository
import com.vidfriends.app.util.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BlockUserRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
) : BlockUserRepository {

    override suspend fun blockUser(userId: String): ApiResult<Unit> {
        val result = safeApiCall { api.blockUser(userId) }
        return result.fold(
            onSuccess = { ApiResult.Success(Unit) },
            onFailure = { ApiResult.Error(it.message ?: "Failed to block user") },
        )
    }

    override suspend fun unblockUser(userId: String): ApiResult<Unit> {
        val result = safeApiCall { api.unblockUser(userId) }
        return result.fold(
            onSuccess = { ApiResult.Success(Unit) },
            onFailure = { ApiResult.Error(it.message ?: "Failed to unblock user") },
        )
    }

    override suspend fun getBlockedUsers(page: Int, limit: Int): ApiResult<List<BlockedUser>> {
        val result = safeApiCall { api.getBlockedUsers(page = page, limit = limit) }
        return result.fold(
            onSuccess = { response ->
                ApiResult.Success(response.users.map { it.toDomain() })
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to load blocked users") },
        )
    }
}
