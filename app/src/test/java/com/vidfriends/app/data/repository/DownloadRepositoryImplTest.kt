package com.vidfriends.app.data.repository

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Environment
import com.vidfriends.app.data.download.DownloadManager
import com.vidfriends.app.data.local.dao.DownloadDao
import com.vidfriends.app.data.local.entity.DownloadEntity
import com.vidfriends.app.data.remote.VidFriendsApi
import com.vidfriends.app.domain.model.DownloadStatus
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import java.io.File

class DownloadRepositoryImplTest {

    private val downloadDao: DownloadDao = mockk()
    private val downloadManager: DownloadManager = mockk()
    private val api: VidFriendsApi = mockk()
    private val context: Context = mockk()
    private val connectivityManager: ConnectivityManager = mockk()

    private lateinit var repository: DownloadRepositoryImpl

    @Before
    fun setup() {
        every { context.getSystemService(Context.CONNECTIVITY_SERVICE) } returns connectivityManager
        every { context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) } returns File("/tmp/test-downloads")
        every { context.getExternalFilesDir(null) } returns File("/tmp/test-downloads")
        every { connectivityManager.activeNetwork } returns null
        every { connectivityManager.getNetworkCapabilities(null) } returns null
        every { connectivityManager.registerNetworkCallback(any(), any()) } returns Unit
        repository = DownloadRepositoryImpl(downloadDao, downloadManager, api, context)
    }

    @Test
    fun `getDownloads returns flow from dao`() = runTest {
        val entities = listOf(
            DownloadEntity(
                id = "d1", videoId = "v1", localPath = "/path/to/v1.mp4",
                status = DownloadStatus.COMPLETED.name, progress = 100,
                downloadedAt = 1000L, fileSize = 1024, mimeType = "video/mp4",
            ),
        )
        coEvery { downloadDao.getAllDownloads() } returns flowOf(entities)

        val result = repository.getDownloads()

        result.collect { downloads ->
            assert(downloads.size == 1)
            assert(downloads[0].videoId == "v1")
            assert(downloads[0].status == DownloadStatus.COMPLETED)
        }
    }

    @Test
    fun `isVideoDownloaded returns true when completed`() = runTest {
        val entity = DownloadEntity(
            id = "d1", videoId = "v1", localPath = "/path/to/v1.mp4",
            status = DownloadStatus.COMPLETED.name, progress = 100,
            downloadedAt = 1000L, fileSize = 1024, mimeType = "video/mp4",
        )
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns entity

        val result = repository.isVideoDownloaded("v1")

        assert(result)
    }

    @Test
    fun `isVideoDownloaded returns false when not found`() = runTest {
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns null

        val result = repository.isVideoDownloaded("v1")

        assert(!result)
    }

    @Test
    fun `deleteAllDownloads clears dao and manager`() = runTest {
        coEvery { downloadManager.cancelAll() } returns Unit
        coEvery { downloadDao.getAllDownloadsSync() } returns emptyList()
        coEvery { downloadDao.deleteAll() } returns Unit

        repository.deleteAllDownloads()

        coVerify { downloadManager.cancelAll() }
        coVerify { downloadDao.deleteAll() }
    }

    @Test
    fun `startDownload creates PENDING entity when offline`() = runTest {
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns null
        coEvery { downloadDao.insert(any()) } returns Unit

        repository.startDownload("v1")

        coVerify {
            downloadDao.insert(match { it.status == DownloadStatus.PENDING.name && it.videoId == "v1" })
        }
    }

    @Test
    fun `startDownload skips when entity already exists and is not FAILED`() = runTest {
        val existing = DownloadEntity(
            id = "d1", videoId = "v1", localPath = null,
            status = DownloadStatus.PENDING.name, progress = 0,
            downloadedAt = null, fileSize = 0L, mimeType = "video/mp4",
        )
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns existing

        repository.startDownload("v1")

        coVerify(exactly = 0) { downloadDao.insert(any()) }
    }

    @Test
    fun `startDownload allows retry when entity is FAILED`() = runTest {
        val existing = DownloadEntity(
            id = "d1", videoId = "v1", localPath = null,
            status = DownloadStatus.FAILED.name, progress = 0,
            downloadedAt = null, fileSize = 0L, mimeType = "video/mp4",
        )
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns existing
        coEvery { downloadDao.insert(any()) } returns Unit

        repository.startDownload("v1")

        coVerify { downloadDao.insert(any()) }
    }

    @Test
    fun `startDownload starts download when online`() = runTest {
        val network = mockk<Network>()
        val capabilities = mockk<NetworkCapabilities>()
        every { connectivityManager.activeNetwork } returns network
        every { connectivityManager.getNetworkCapabilities(network) } returns capabilities
        every { capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) } returns true
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns null
        coEvery { api.getVideo("v1") } returns Result.success(mockk(relaxed = true) {
            every { filePath } returns "https://example.com/v1.mp4"
            every { sourceUrl } returns null
            every { fileSize } returns 1024L
            every { mimeType } returns "video/mp4"
        })
        coEvery { downloadDao.insert(any()) } returns Unit
        coEvery { downloadManager.download(any(), any(), any()) } returns Unit

        repository.startDownload("v1")

        coVerify { downloadDao.insert(match { it.status == DownloadStatus.DOWNLOADING.name }) }
    }

    @Test
    fun `pauseDownload cancels and updates status`() = runTest {
        val entity = DownloadEntity(
            id = "d1", videoId = "v1", localPath = "/path/to/v1.mp4",
            status = DownloadStatus.DOWNLOADING.name, progress = 50,
            downloadedAt = null, fileSize = 1024, mimeType = "video/mp4",
        )
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns entity
        coEvery { downloadDao.updateStatus(any(), any(), any(), any()) } returns Unit

        repository.pauseDownload("v1")

        coVerify { downloadManager.cancel("v1") }
        coVerify {
            downloadDao.updateStatus(
                id = "d1",
                status = DownloadStatus.PAUSED.name,
                progress = 50,
                localPath = "/path/to/v1.mp4",
            )
        }
    }

    @Test
    fun `resumeDownload resumes paused download`() = runTest {
        val entity = DownloadEntity(
            id = "d1", videoId = "v1", localPath = "/path/to/v1.mp4",
            status = DownloadStatus.PAUSED.name, progress = 50,
            downloadedAt = null, fileSize = 1024, mimeType = "video/mp4",
        )
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns entity
        coEvery { api.getVideo("v1") } returns Result.success(mockk(relaxed = true) {
            every { filePath } returns "https://example.com/v1.mp4"
            every { sourceUrl } returns null
            every { fileSize } returns 1024L
            every { mimeType } returns "video/mp4"
        })
        coEvery { downloadDao.insert(any()) } returns Unit
        coEvery { downloadManager.download(any(), any(), any(), any()) } returns Unit

        repository.resumeDownload("v1")

        coVerify { downloadDao.insert(match { it.status == DownloadStatus.DOWNLOADING.name }) }
    }

    @Test
    fun `cancelDownload cancels and deletes entity`() = runTest {
        val entity = DownloadEntity(
            id = "d1", videoId = "v1", localPath = "/path/to/v1.mp4",
            status = DownloadStatus.DOWNLOADING.name, progress = 50,
            downloadedAt = null, fileSize = 1024, mimeType = "video/mp4",
        )
        coEvery { downloadDao.getDownloadByVideoIdSync("v1") } returns entity
        coEvery { downloadDao.deleteById("d1") } returns Unit

        repository.cancelDownload("v1")

        coVerify { downloadManager.cancel("v1") }
        coVerify { downloadDao.deleteById("d1") }
    }

    @Test
    fun `getStorageInfo uses external files dir`() = runTest {
        coEvery { downloadDao.totalCompletedSize() } returns 500L

        val info = repository.getStorageInfo()

        assert(info.usedBytes == 500L)
    }
}
