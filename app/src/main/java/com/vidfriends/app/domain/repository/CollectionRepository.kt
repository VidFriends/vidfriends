package com.vidfriends.app.domain.repository

import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Collection
import com.vidfriends.app.domain.model.Video

interface CollectionRepository {
    suspend fun getCollections(): ApiResult<List<Collection>>
    suspend fun createCollection(name: String, description: String?): ApiResult<Collection>
    suspend fun updateCollection(id: String, name: String?, description: String?): ApiResult<Collection>
    suspend fun deleteCollection(id: String): ApiResult<Unit>
    suspend fun addVideoToCollection(collectionId: String, videoId: String): ApiResult<Unit>
    suspend fun removeVideoFromCollection(collectionId: String, videoId: String): ApiResult<Unit>
    suspend fun getCollectionVideos(collectionId: String): ApiResult<List<Video>>
}
