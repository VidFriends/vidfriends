package com.vidfriends.android.domain.repository

import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.Video

interface FeedRepository {
    suspend fun getFeed(page: Int = 1, limit: Int = 10): ApiResult<List<Video>>
    suspend fun likeVideo(videoId: String): ApiResult<Unit>
    suspend fun unlikeVideo(videoId: String): ApiResult<Unit>
    suspend fun markWatched(videoId: String): ApiResult<Unit>
}
