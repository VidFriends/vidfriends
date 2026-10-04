package com.vidfriends.app.data.download

import android.content.Context
import com.vidfriends.app.data.local.dao.DownloadDao
import com.vidfriends.app.data.local.entity.DownloadEntity
import com.vidfriends.app.domain.model.DownloadStatus
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.Before
import org.junit.Test
import java.io.File

class DownloadManagerTest {

    private val downloadDao: DownloadDao = mockk(relaxed = true)
    private val okHttpClient: OkHttpClient = mockk(relaxed = true)
    private val notificationHelper: DownloadNotificationHelper = mockk(relaxed = true)
    private val context: Context = mockk(relaxed = true)

    private lateinit var downloadManager: DownloadManager

    @Before
    fun setup() {
        downloadManager = DownloadManager(downloadDao, okHttpClient, notificationHelper, context)
    }

    @Test
    fun `isDownloading returns false for unknown video`() {
        assert(!downloadManager.isDownloading("unknown"))
    }

    @Test
    fun `download tracks active job`() {
        val entity = DownloadEntity(
            id = "d1", videoId = "v1", localPath = null,
            status = DownloadStatus.PENDING.name, progress = 0,
            downloadedAt = null, fileSize = 0L, mimeType = "video/mp4",
        )

        downloadManager.download(entity, "https://example.com/video.mp4", mockk(relaxed = true))

        assert(downloadManager.isDownloading("v1"))
    }

    @Test
    fun `cancel removes active download`() {
        val entity = DownloadEntity(
            id = "d1", videoId = "v1", localPath = null,
            status = DownloadStatus.PENDING.name, progress = 0,
            downloadedAt = null, fileSize = 0L, mimeType = "video/mp4",
        )

        downloadManager.download(entity, "https://example.com/video.mp4", mockk(relaxed = true))
        downloadManager.cancel("v1")

        assert(!downloadManager.isDownloading("v1"))
    }

    @Test
    fun `cancelAll removes all active downloads`() {
        val entity1 = DownloadEntity(
            id = "d1", videoId = "v1", localPath = null,
            status = DownloadStatus.PENDING.name, progress = 0,
            downloadedAt = null, fileSize = 0L, mimeType = "video/mp4",
        )
        val entity2 = DownloadEntity(
            id = "d2", videoId = "v2", localPath = null,
            status = DownloadStatus.PENDING.name, progress = 0,
            downloadedAt = null, fileSize = 0L, mimeType = "video/mp4",
        )

        downloadManager.download(entity1, "https://example.com/v1.mp4", mockk(relaxed = true))
        downloadManager.download(entity2, "https://example.com/v2.mp4", mockk(relaxed = true))

        downloadManager.cancelAll()

        assert(!downloadManager.isDownloading("v1"))
        assert(!downloadManager.isDownloading("v2"))
    }

    @Test
    fun `download does not duplicate active videoId`() {
        val entity = DownloadEntity(
            id = "d1", videoId = "v1", localPath = null,
            status = DownloadStatus.PENDING.name, progress = 0,
            downloadedAt = null, fileSize = 0L, mimeType = "video/mp4",
        )

        downloadManager.download(entity, "https://example.com/video.mp4", mockk(relaxed = true))
        downloadManager.download(entity, "https://example.com/video.mp4", mockk(relaxed = true))

        verify(exactly = 1) { context.startForegroundService(any()) }
    }

    @Test
    fun `destroy cancels all and clears state`() {
        val entity = DownloadEntity(
            id = "d1", videoId = "v1", localPath = null,
            status = DownloadStatus.PENDING.name, progress = 0,
            downloadedAt = null, fileSize = 0L, mimeType = "video/mp4",
        )

        downloadManager.download(entity, "https://example.com/video.mp4", mockk(relaxed = true))
        downloadManager.destroy()

        assert(!downloadManager.isDownloading("v1"))
    }
}
