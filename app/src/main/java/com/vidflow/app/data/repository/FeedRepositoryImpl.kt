package com.vidflow.app.data.repository

import com.vidflow.app.data.dto.toDomain
import com.vidflow.app.data.local.dao.VideoDao
import com.vidflow.app.data.local.toDomain
import com.vidflow.app.data.local.toEntity
import com.vidflow.app.data.remote.VidFriendsApi
import com.vidflow.app.domain.model.ApiResult
import com.vidflow.app.domain.model.Video
import com.vidflow.app.domain.repository.FeedRepository
import com.vidflow.app.util.safeApiCall
import kotlinx.coroutines.flow.firstOrNull
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FeedRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
    private val videoDao: VideoDao,
) : FeedRepository {

    override suspend fun getFeed(page: Int, limit: Int): ApiResult<List<Video>> {
        val result = safeApiCall { api.getFeed(page = page, limit = limit) }
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
                    ApiResult.Error(it.message ?: "Failed to load feed")
                }
            },
        )
    }

    override suspend fun likeVideo(videoId: String): ApiResult<Unit> {
        val result = safeApiCall { api.likeVideo(videoId) }
        return result.fold(
            onSuccess = {
                videoDao.updateLikeStatus(videoId, true, -1)
                ApiResult.Success(Unit)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to like video") },
        )
    }

    override suspend fun unlikeVideo(videoId: String): ApiResult<Unit> {
        val result = safeApiCall { api.unlikeVideo(videoId) }
        return result.fold(
            onSuccess = {
                videoDao.updateLikeStatus(videoId, false, -1)
                ApiResult.Success(Unit)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to unlike video") },
        )
    }

    override suspend fun markWatched(videoId: String): ApiResult<Unit> {
        val result = safeApiCall { api.markWatched(videoId) }
        return result.fold(
            onSuccess = { ApiResult.Success(Unit) },
            onFailure = { ApiResult.Error(it.message ?: "Failed to mark watched") },
        )
    }
}
