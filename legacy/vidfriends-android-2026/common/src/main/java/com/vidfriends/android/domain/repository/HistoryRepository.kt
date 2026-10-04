package com.vidfriends.android.domain.repository

import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.Video

interface HistoryRepository {
    suspend fun getHistory(page: Int = 1, limit: Int = 20): ApiResult<List<Video>>
    suspend fun clearHistory(): ApiResult<Unit>
}
