package com.vidflow.app.domain.repository

import com.vidflow.app.domain.model.ApiResult
import com.vidflow.app.domain.model.Video

interface FeedRepository {
    suspend fun getFeed(page: Int = 1, limit: Int = 10): ApiResult<List<Video>>
    suspend fun likeVideo(videoId: String): ApiResult<Unit>
    suspend fun unlikeVideo(videoId: String): ApiResult<Unit>
    suspend fun markWatched(videoId: String): ApiResult<Unit>
}
