package com.vidfriends.app.domain.repository

import com.vidfriends.app.domain.model.ApiResult

interface SetupRepository {
    suspend fun healthCheck(): ApiResult<Unit>
}
