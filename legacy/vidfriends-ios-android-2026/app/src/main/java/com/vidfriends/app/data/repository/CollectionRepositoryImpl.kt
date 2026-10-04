package com.vidfriends.app.data.repository

import com.vidfriends.app.data.dto.toDomain
import com.vidfriends.app.data.local.dao.CollectionDao
import com.vidfriends.app.data.local.dao.CollectionVideoDao
import com.vidfriends.app.data.local.dao.VideoDao
import com.vidfriends.app.data.local.entity.CollectionVideoEntity
import com.vidfriends.app.data.local.toDomain
import com.vidfriends.app.data.local.toEntity
import com.vidfriends.app.data.remote.VidFriendsApi
import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Collection
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.domain.repository.CollectionRepository
import com.vidfriends.app.util.safeApiCall
import kotlinx.coroutines.flow.firstOrNull
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CollectionRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
    private val collectionDao: CollectionDao,
    private val collectionVideoDao: CollectionVideoDao,
    private val videoDao: VideoDao,
) : CollectionRepository {

    override suspend fun getCollections(): ApiResult<List<Collection>> {
        val result = safeApiCall { api.getCollections() }
        return result.fold(
            onSuccess = { response ->
                val collections = response.map { it.toDomain() }
                collectionDao.insertAll(collections.map { it.toEntity() })
                ApiResult.Success(collections)
            },
            onFailure = {
                val cached = collectionDao.getAllCollections().firstOrNull()
                if (cached != null && cached.isNotEmpty()) {
                    ApiResult.Success(cached.map { it.toDomain() })
                } else {
                    ApiResult.Error(it.message ?: "Failed to load collections")
                }
            },
        )
    }

    override suspend fun createCollection(name: String, description: String?): ApiResult<Collection> {
        val result = safeApiCall { api.createCollection(com.vidfriends.app.data.dto.CreateCollectionRequestDto(name, description)) }
        return result.fold(
            onSuccess = {
                val collection = it.toDomain()
                collectionDao.insert(collection.toEntity())
                ApiResult.Success(collection)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to create collection") },
        )
    }

    override suspend fun updateCollection(id: String, name: String?, description: String?): ApiResult<Collection> {
        val result = safeApiCall { api.updateCollection(id, com.vidfriends.app.data.dto.UpdateCollectionRequestDto(name, description)) }
        return result.fold(
            onSuccess = { ApiResult.Success(it.toDomain()) },
            onFailure = { ApiResult.Error(it.message ?: "Failed to update collection") },
        )
    }

    override suspend fun deleteCollection(id: String): ApiResult<Unit> {
        val result = safeApiCall { api.deleteCollection(id) }
        return result.fold(
            onSuccess = {
                collectionVideoDao.deleteAllForCollection(id)
                collectionDao.deleteById(id)
                ApiResult.Success(Unit)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to delete collection") },
        )
    }

    override suspend fun addVideoToCollection(collectionId: String, videoId: String): ApiResult<Unit> {
        val result = safeApiCall {
            api.addVideoToCollection(collectionId, com.vidfriends.app.data.dto.AddCollectionVideoRequestDto(videoId))
        }
        return result.fold(
            onSuccess = {
                val now = Instant.now().toString()
                collectionVideoDao.insert(CollectionVideoEntity(collectionId, videoId, now))
                val collection = collectionDao.getCollectionById(collectionId)
                if (collection != null) {
                    collectionDao.insert(collection.copy(videoCount = collection.videoCount + 1))
                }
                ApiResult.Success(Unit)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to add video to collection") },
        )
    }

    override suspend fun removeVideoFromCollection(collectionId: String, videoId: String): ApiResult<Unit> {
        val result = safeApiCall { api.removeVideoFromCollection(collectionId, videoId) }
        return result.fold(
            onSuccess = {
                collectionVideoDao.deleteVideoFromCollection(collectionId, videoId)
                val collection = collectionDao.getCollectionById(collectionId)
                if (collection != null) {
                    collectionDao.insert(collection.copy(videoCount = (collection.videoCount - 1).coerceAtLeast(0)))
                }
                ApiResult.Success(Unit)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to remove video from collection") },
        )
    }

    override suspend fun getCollectionVideos(collectionId: String): ApiResult<List<Video>> {
        val result = safeApiCall { api.getCollectionVideos(collectionId) }
        return result.fold(
            onSuccess = { response ->
                val videos = response.mapNotNull { entry ->
                    entry.video?.toDomain()
                }
                ApiResult.Success(videos)
            },
            onFailure = {
                val cachedVideos = collectionVideoDao.getVideosForCollection(collectionId).firstOrNull()
                if (cachedVideos != null && cachedVideos.isNotEmpty()) {
                    val videoIds = cachedVideos.map { it.videoId }
                    val videos = videoDao.getAllVideos().firstOrNull()
                        ?.filter { it.id in videoIds }
                        ?.map { it.toDomain() }
                    if (videos != null && videos.isNotEmpty()) {
                        ApiResult.Success(videos)
                    } else {
                        ApiResult.Error(it.message ?: "Failed to load collection videos")
                    }
                } else {
                    ApiResult.Error(it.message ?: "Failed to load collection videos")
                }
            },
        )
    }
}
