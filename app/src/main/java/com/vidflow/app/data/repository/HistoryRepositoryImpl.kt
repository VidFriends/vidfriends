package com.vidflow.app.data.repository

import com.vidflow.app.data.dto.toDomain
import com.vidflow.app.data.local.dao.VideoDao
import com.vidflow.app.data.local.toDomain
import com.vidflow.app.data.local.toEntity
import com.vidflow.app.data.remote.VidFriendsApi
import com.vidflow.app.domain.model.ApiResult
import com.vidflow.app.domain.model.Video
import com.vidflow.app.domain.repository.HistoryRepository
import com.vidflow.app.util.safeApiCall
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
