package com.vidfriends.app.domain.repository

import com.vidfriends.app.domain.model.Download
import com.vidfriends.app.domain.model.StorageInfo
import kotlinx.coroutines.flow.Flow

interface DownloadRepository {
    fun getDownloads(): Flow<List<Download>>
    fun getDownloadForVideo(videoId: String): Flow<Download?>
    suspend fun startDownload(videoId: String)
    suspend fun pauseDownload(videoId: String)
    suspend fun resumeDownload(videoId: String)
    suspend fun cancelDownload(videoId: String)
    suspend fun deleteDownload(videoId: String)
    suspend fun deleteAllDownloads()
    suspend fun getStorageInfo(): StorageInfo
    suspend fun isVideoDownloaded(videoId: String): Boolean
}
