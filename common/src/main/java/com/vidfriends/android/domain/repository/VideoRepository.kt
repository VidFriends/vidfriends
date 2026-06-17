package com.vidfriends.android.domain.repository

import com.vidfriends.android.domain.model.*
import java.io.File

interface VideoRepository {
    suspend fun getVideo(id: String): ApiResult<Video>
    suspend fun sendLink(sourceUrl: String, caption: String?): ApiResult<Video>
    suspend fun uploadFile(file: File, caption: String?): ApiResult<Video>
    suspend fun getComments(videoId: String): ApiResult<List<Comment>>
    suspend fun addComment(videoId: String, text: String): ApiResult<Comment>
    suspend fun deleteComment(videoId: String, commentId: String): ApiResult<Unit>
    suspend fun deleteVideo(videoId: String): ApiResult<Unit>
    suspend fun getVideoStatus(videoId: String): ApiResult<String>
}
