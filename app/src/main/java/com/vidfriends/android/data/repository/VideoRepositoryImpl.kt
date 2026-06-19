package com.vidfriends.android.data.repository

import com.vidfriends.android.data.dto.CommentRequestDto
import com.vidfriends.android.data.dto.SendLinkRequestDto
import com.vidfriends.android.data.dto.toDomain
import com.vidfriends.android.data.local.dao.CommentDao
import com.vidfriends.android.data.local.dao.VideoDao
import com.vidfriends.android.data.local.toDomain
import com.vidfriends.android.data.local.toEntity
import com.vidfriends.android.data.remote.VidFriendsApi
import com.vidfriends.android.domain.model.*
import com.vidfriends.android.domain.repository.VideoRepository
import com.vidfriends.android.util.safeApiCall
import kotlinx.coroutines.flow.firstOrNull
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class VideoRepositoryImpl @Inject constructor(
    private val api: VidFriendsApi,
    private val videoDao: VideoDao,
    private val commentDao: CommentDao,
) : VideoRepository {

    override suspend fun getVideo(id: String): ApiResult<Video> {
        val cached = videoDao.getVideoById(id)
        if (cached != null) {
            return ApiResult.Success(cached.toDomain())
        }

        val result = safeApiCall { api.getVideo(id) }
        return result.fold(
            onSuccess = { dto ->
                val video = dto.toDomain()
                videoDao.insert(video.toEntity())
                ApiResult.Success(video)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to load video") },
        )
    }

    override suspend fun sendLink(sourceUrl: String, caption: String?): ApiResult<Video> {
        val result = safeApiCall {
            api.sendLink(SendLinkRequestDto(sourceUrl = sourceUrl, caption = caption))
        }
        return result.fold(
            onSuccess = { ApiResult.Success(it.toDomain()) },
            onFailure = { ApiResult.Error(it.message ?: "Failed to send link") },
        )
    }

    override suspend fun uploadFile(file: File, caption: String?): ApiResult<Video> {
        val requestFile = file.readBytes()
            .toRequestBody("video/*".toMediaTypeOrNull())
        val part = MultipartBody.Part.createFormData("file", file.name, requestFile)
        val captionPart = caption?.toRequestBody("text/plain".toMediaTypeOrNull())

        val result = safeApiCall { api.uploadVideo(part, captionPart) }
        return result.fold(
            onSuccess = { ApiResult.Success(it.toDomain()) },
            onFailure = { ApiResult.Error(it.message ?: "Failed to upload video") },
        )
    }

    override suspend fun getComments(videoId: String): ApiResult<List<Comment>> {
        val result = safeApiCall { api.getComments(videoId) }
        return result.fold(
            onSuccess = { response ->
                val comments = response.map { it.toDomain() }
                commentDao.insertAll(comments.map { it.toEntity() })
                ApiResult.Success(comments)
            },
            onFailure = {
                val cached = commentDao.getCommentsForVideo(videoId)
                val cachedList = cached.firstOrNull()
                if (cachedList != null && cachedList.isNotEmpty()) {
                    ApiResult.Success(cachedList.map { it.toDomain() })
                } else {
                    ApiResult.Error(it.message ?: "Failed to load comments")
                }
            },
        )
    }

    override suspend fun addComment(videoId: String, text: String): ApiResult<Comment> {
        val result = safeApiCall {
            api.addComment(videoId, CommentRequestDto(text = text))
        }
        return result.fold(
            onSuccess = {
                val comment = it.toDomain()
                commentDao.insert(comment.toEntity())
                ApiResult.Success(comment)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to add comment") },
        )
    }

    override suspend fun deleteComment(videoId: String, commentId: String): ApiResult<Unit> {
        val result = safeApiCall { api.deleteComment(videoId, commentId) }
        return result.fold(
            onSuccess = {
                commentDao.deleteById(commentId)
                ApiResult.Success(Unit)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to delete comment") },
        )
    }

    override suspend fun deleteVideo(videoId: String): ApiResult<Unit> {
        val result = safeApiCall { api.deleteVideo(videoId) }
        return result.fold(
            onSuccess = {
                videoDao.deleteById(videoId)
                ApiResult.Success(Unit)
            },
            onFailure = { ApiResult.Error(it.message ?: "Failed to delete video") },
        )
    }

    override suspend fun getVideoStatus(videoId: String): ApiResult<String> {
        val result = safeApiCall { api.getVideoStatus(videoId) }
        return result.fold(
            onSuccess = { ApiResult.Success(it.status) },
            onFailure = { ApiResult.Error(it.message ?: "Failed to get status") },
        )
    }
}
