package com.vidfriends.app.domain.repository

import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.BlockedUser

interface BlockUserRepository {
    suspend fun blockUser(userId: String): ApiResult<Unit>
    suspend fun unblockUser(userId: String): ApiResult<Unit>
    suspend fun getBlockedUsers(page: Int = 1, limit: Int = 20): ApiResult<List<BlockedUser>>
}
