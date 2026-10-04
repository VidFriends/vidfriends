package com.vidfriends.app.data.download

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import com.vidfriends.app.data.local.dao.DownloadDao
import com.vidfriends.app.data.local.entity.DownloadEntity
import com.vidfriends.app.domain.model.DownloadStatus
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DownloadManager @Inject constructor(
    private val downloadDao: DownloadDao,
    private val okHttpClient: OkHttpClient,
    private val notificationHelper: DownloadNotificationHelper,
    @ApplicationContext private val context: Context,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val activeDownloads = ConcurrentHashMap<String, Job>()

    fun download(downloadEntity: DownloadEntity, url: String, downloadDir: File) {
        download(downloadEntity, url, downloadDir, existingPath = null)
    }

    fun download(
        downloadEntity: DownloadEntity,
        url: String,
        downloadDir: File,
        existingPath: String?,
    ) {
        if (activeDownloads.containsKey(downloadEntity.videoId)) return

        startForeground(downloadEntity.videoId)

        val job = scope.launch {
            try {
                val extension = resolveExtension(downloadEntity.mimeType)
                val fileName = "${downloadEntity.videoId}_${System.currentTimeMillis()}$extension"
                val file = existingPath?.let { File(it) } ?: File(downloadDir, fileName)

                val existingBytes = if (file.exists()) file.length() else 0L
                val resume = existingBytes > 0L

                val requestBuilder = Request.Builder()
                if (resume) {
                    requestBuilder.header("Range", "bytes=$existingBytes-")
                }
                val request = requestBuilder.url(url).build()
                val response = okHttpClient.newCall(request).execute()

                val body = response.body ?: throw Exception("Empty response body")

                val contentLength = if (resume) {
                    body.contentLength() + existingBytes
                } else {
                    body.contentLength()
                }
                val inputStream = body.byteStream()
                val outputStream = if (resume) {
                    RandomAccessFile(file, "rw").apply { seek(existingBytes) }
                } else {
                    file.parentFile?.mkdirs()
                    FileOutputStream(file)
                }
                val buffer = ByteArray(8192)
                var bytesRead: Int
                var totalBytesRead = existingBytes

                while (isActive) {
                    bytesRead = inputStream.read(buffer)
                    if (bytesRead == -1) break
                    if (outputStream is RandomAccessFile) {
                        outputStream.write(buffer, 0, bytesRead)
                    } else {
                        (outputStream as FileOutputStream).write(buffer, 0, bytesRead)
                    }
                    totalBytesRead += bytesRead

                    val progress = if (contentLength > 0) {
                        ((totalBytesRead * 100) / contentLength).toInt().coerceIn(0, 100)
                    } else 0

                    downloadDao.updateProgress(downloadEntity.id, progress)
                    updateForegroundNotification(downloadEntity.videoId, progress)
                }

                if (outputStream is RandomAccessFile) outputStream.close()
                else (outputStream as FileOutputStream).close()
                inputStream.close()

                if (isActive) {
                    downloadDao.updateStatus(
                        id = downloadEntity.id,
                        status = DownloadStatus.COMPLETED.name,
                        progress = 100,
                        localPath = file.absolutePath,
                    )
                    showCompleteNotification(downloadEntity.videoId)
                }
            } catch (_: CancellationException) {
            } catch (e: Exception) {
                downloadDao.updateStatus(
                    id = downloadEntity.id,
                    status = DownloadStatus.FAILED.name,
                    progress = 0,
                    localPath = null,
                )
            } finally {
                activeDownloads.remove(downloadEntity.videoId)
                if (activeDownloads.isEmpty()) stopForeground()
            }
        }

        activeDownloads[downloadEntity.videoId] = job
    }

    fun cancel(videoId: String) {
        activeDownloads[videoId]?.cancel()
        activeDownloads.remove(videoId)
        if (activeDownloads.isEmpty()) stopForeground()
    }

    fun cancelAll() {
        activeDownloads.values.forEach { it.cancel() }
        activeDownloads.clear()
        stopForeground()
    }

    fun isDownloading(videoId: String): Boolean = activeDownloads.containsKey(videoId)

    private fun startForeground(videoId: String? = null) {
        val intent = Intent(context, DownloadService::class.java).apply {
            putExtra(DownloadService.EXTRA_ACTION, DownloadService.ACTION_START_FOREGROUND)
            videoId?.let { putExtra(DownloadService.EXTRA_VIDEO_NAME, it) }
        }
        context.startForegroundService(intent)
    }

    private fun stopForeground() {
        val intent = Intent(context, DownloadService::class.java).apply {
            putExtra(DownloadService.EXTRA_ACTION, DownloadService.ACTION_STOP_FOREGROUND)
        }
        context.startService(intent)
    }

    private fun updateForegroundNotification(videoId: String, progress: Int) {
        val notification = notificationHelper.buildProgressNotification(
            videoName = videoId,
            progress = progress,
            isForeground = true,
        ).build()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(DownloadService.FOREGROUND_NOTIFICATION_ID, notification)
    }

    private fun showCompleteNotification(videoId: String) {
        val notification = notificationHelper.buildCompleteNotification(
            videoName = videoId,
        ).build()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(DownloadService.FOREGROUND_NOTIFICATION_ID, notification)
    }

    fun destroy() {
        cancelAll()
        scope.cancel()
    }

    private fun resolveExtension(mimeType: String): String {
        return when {
            mimeType.contains("mp4") -> ".mp4"
            mimeType.contains("webm") -> ".webm"
            mimeType.contains("mkv") -> ".mkv"
            mimeType.contains("avi") -> ".avi"
            mimeType.contains("mov") -> ".mov"
            else -> ".mp4"
        }
    }
}
