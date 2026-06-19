package com.vidfriends.android.data.repository

import com.vidfriends.android.data.dto.toDomain
import com.vidfriends.android.data.local.dao.VideoDao
import com.vidfriends.android.data.local.toDomain
import com.vidfriends.android.data.local.toEntity
import com.vidfriends.android.data.remote.VidFriendsApi
import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.Video
import com.vidfriends.android.domain.repository.HistoryRepository
import com.vidfriends.android.util.safeApiCall
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HistoryRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
    private val videoDao: VideoDao,
) : HistoryRepository {

    override suspend fun getHistory(page: Int, limit: Int): ApiResult<List<Video>> {
        val result = safeApiCall { api.getHistory(page = page, limit = limit) }
        return result.fold(
            onSuccess = { response ->
                val videos = response.videos.map { it.toDomain() }
                videoDao.insertAll(videos.map { it.toEntity() })
                ApiResult.Success(videos)
            },
            onFailure = {
                val cached = videoDao.getAllVideos()
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
        videoDao.deleteAll()
        return ApiResult.Success(Unit)
    }
}
