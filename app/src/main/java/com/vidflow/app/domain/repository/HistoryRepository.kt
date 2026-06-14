package com.vidflow.app.domain.repository

import com.vidflow.app.domain.model.ApiResult
import com.vidflow.app.domain.model.Video

interface HistoryRepository {
    suspend fun getHistory(page: Int = 1, limit: Int = 20): ApiResult<List<Video>>
    suspend fun clearHistory(): ApiResult<Unit>
}
