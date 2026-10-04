package com.vidfriends.app.data.repository

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Environment
import android.os.StatFs
import com.vidfriends.app.data.download.DownloadManager
import com.vidfriends.app.data.local.dao.DownloadDao
import com.vidfriends.app.data.local.entity.DownloadEntity
import com.vidfriends.app.data.local.toDomain
import com.vidfriends.app.data.remote.VidFriendsApi
import com.vidfriends.app.domain.model.Download
import com.vidfriends.app.domain.model.DownloadStatus
import com.vidfriends.app.domain.model.StorageInfo
import com.vidfriends.app.domain.repository.DownloadRepository
import com.vidfriends.app.util.safeApiCall
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DownloadRepositoryImpl @Inject constructor(
    private val downloadDao: DownloadDao,
    private val downloadManager: DownloadManager,
    private val api: VidFriendsApi,
    @ApplicationContext private val context: Context,
) : DownloadRepository {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private var networkCallbackRegistered = false

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            scope.launch {
                retryPendingDownloads()
            }
        }
    }

    private fun ensureNetworkCallbackRegistered() {
        if (networkCallbackRegistered) return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
        networkCallbackRegistered = true
    }

    fun cleanup() {
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) { }
        networkCallbackRegistered = false
        scope.cancel()
    }

    private suspend fun retryPendingDownloads() {
        val pending = downloadDao.getAllDownloadsSync().filter {
            it.status == DownloadStatus.PENDING.name
        }
        pending.forEach { entity ->
            startDownload(entity.videoId)
        }
    }

    override fun getDownloads(): Flow<List<Download>> {
        return downloadDao.getAllDownloads().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    override fun getDownloadForVideo(videoId: String): Flow<Download?> {
        return downloadDao.getDownloadByVideoId(videoId).map { it?.toDomain() }
    }

    override suspend fun startDownload(videoId: String) {
        val existing = downloadDao.getDownloadByVideoIdSync(videoId)
        if (existing != null && existing.status != DownloadStatus.FAILED.name) return

        ensureStorageAvailable()
        ensureNetworkCallbackRegistered()

        if (!isOnline()) {
            val pendingEntity = DownloadEntity(
                id = UUID.randomUUID().toString(),
                videoId = videoId,
                localPath = null,
                status = DownloadStatus.PENDING.name,
                progress = 0,
                downloadedAt = null,
                fileSize = 0L,
                mimeType = "video/mp4",
            )
            downloadDao.insert(pendingEntity)
            return
        }

        val videoResult = safeApiCall { api.getVideo(videoId) }
        val video = videoResult.getOrNull() ?: return

        val url = video.filePath.ifBlank { video.sourceUrl ?: "" }
        if (url.isBlank()) return

        val downloadDir = getDownloadDir()
        downloadDir.mkdirs()

        val entity = DownloadEntity(
            id = UUID.randomUUID().toString(),
            videoId = videoId,
            localPath = null,
            status = DownloadStatus.DOWNLOADING.name,
            progress = 0,
            downloadedAt = null,
            fileSize = video.fileSize,
            mimeType = video.mimeType,
        )
        downloadDao.insert(entity)

        downloadManager.download(entity, url, downloadDir)
    }

    override suspend fun pauseDownload(videoId: String) {
        downloadManager.cancel(videoId)
        val entity = downloadDao.getDownloadByVideoIdSync(videoId)
        entity?.let {
            downloadDao.updateStatus(
                id = it.id,
                status = DownloadStatus.PAUSED.name,
                progress = it.progress,
                localPath = it.localPath,
            )
        }
    }

    override suspend fun resumeDownload(videoId: String) {
        val entity = downloadDao.getDownloadByVideoIdSync(videoId)
        if (entity == null || entity.status != DownloadStatus.PAUSED.name) return

        val videoResult = safeApiCall { api.getVideo(videoId) }
        val video = videoResult.getOrNull() ?: return

        val url = video.filePath.ifBlank { video.sourceUrl ?: "" }
        if (url.isBlank()) return

        val downloadDir = getDownloadDir()
        downloadDir.mkdirs()

        val resumedEntity = entity.copy(
            status = DownloadStatus.DOWNLOADING.name,
        )
        downloadDao.insert(resumedEntity)

        downloadManager.download(resumedEntity, url, downloadDir, existingPath = entity.localPath)
    }

    override suspend fun cancelDownload(videoId: String) {
        downloadManager.cancel(videoId)
        val entity = downloadDao.getDownloadByVideoIdSync(videoId)
        entity?.let {
            downloadDao.deleteById(it.id)
            deleteFile(it.localPath)
        }
    }

    override suspend fun deleteDownload(videoId: String) {
        cancelDownload(videoId)
    }

    override suspend fun deleteAllDownloads() {
        downloadManager.cancelAll()
        val downloads = downloadDao.getAllDownloadsSync()
        downloads.forEach { entity ->
            deleteFile(entity.localPath)
        }
        downloadDao.deleteAll()
    }

    override suspend fun getStorageInfo(): StorageInfo {
        return withContext(Dispatchers.IO) {
            val storage = context.getExternalFilesDir(null)
            val usedByDownloads = downloadDao.totalCompletedSize() ?: 0L
            StorageInfo(
                availableBytes = storage?.freeSpace ?: 0L,
                usedBytes = usedByDownloads,
                totalBytes = storage?.totalSpace ?: 0L,
            )
        }
    }

    override suspend fun isVideoDownloaded(videoId: String): Boolean {
        val entity = downloadDao.getDownloadByVideoIdSync(videoId)
        return entity != null && entity.status == DownloadStatus.COMPLETED.name
    }

    private fun isOnline(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val caps = connectivityManager.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private suspend fun ensureStorageAvailable() {
        val downloadDir = getDownloadDir()
        val stats = StatFs(downloadDir.absolutePath)
        val availableBytes = stats.availableBytes
        val lowThreshold = 100L * 1024 * 1024
        if (availableBytes < lowThreshold) {
            val failed = downloadDao.getAllDownloadsSync().filter {
                it.status == DownloadStatus.FAILED.name || it.status == DownloadStatus.PAUSED.name
            }
            failed.forEach { entity ->
                deleteFile(entity.localPath)
                downloadDao.deleteById(entity.id)
            }
        }
    }

    private fun getDownloadDir(): File {
        val base = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
            ?: context.filesDir
        val dir = File(base, "VidFriends")
        dir.mkdirs()
        return dir
    }

    private fun deleteFile(path: String?) {
        path?.let {
            try {
                File(it).delete()
            } catch (_: Exception) {}
        }
    }
}
