package com.vidfriends.app.data.repository

import com.vidfriends.app.data.remote.VidFriendsApi
import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.repository.SetupRepository
import com.vidfriends.app.util.safeApiCall
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SetupRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
) : SetupRepository {

    override suspend fun healthCheck(): ApiResult<Unit> {
        val result = safeApiCall { api.healthCheck() }
        return result.fold(
            onSuccess = { ApiResult.Success(Unit) },
            onFailure = { ApiResult.Error(it.message ?: "Health check failed") },
        )
    }
}
