package com.vidfriends.app.data.repository

import com.vidfriends.app.data.dto.toDomain
import com.vidfriends.app.data.local.dao.HistoryVideoDao
import com.vidfriends.app.data.local.toDomain
import com.vidfriends.app.data.local.toHistoryEntity
import com.vidfriends.app.data.remote.VidFriendsApi
import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.domain.repository.HistoryRepository
import com.vidfriends.app.util.safeApiCall
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HistoryRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
    private val historyVideoDao: HistoryVideoDao,
) : HistoryRepository {

    override suspend fun getHistory(page: Int, limit: Int): ApiResult<List<Video>> {
        val result = safeApiCall { api.getHistory(page = page, limit = limit) }
        return result.fold(
            onSuccess = { response ->
                val videos = response.videos.map { it.toDomain() }
                historyVideoDao.insertAll(videos.map { it.toHistoryEntity() })
                ApiResult.Success(videos)
            },
            onFailure = {
                val cached = historyVideoDao.getAllHistoryVideos()
                val cachedList = cached.firstOrNull()
                if (cachedList != null && cachedList.isNotEmpty()) {
                    ApiResult.Success(cachedList.map { it.toDomain() })
                } else {
                    ApiResult.Error(it.message ?: "Failed to load history")
                }
            },
        )
    }

    override suspend fun clearHistory(): ApiResult<Unit> {
        historyVideoDao.deleteAll()
        return ApiResult.Success(Unit)
    }
}
