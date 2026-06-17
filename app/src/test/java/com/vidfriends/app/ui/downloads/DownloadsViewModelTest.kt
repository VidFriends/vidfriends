package com.vidfriends.app.ui.downloads

import android.content.Context
import com.vidfriends.app.domain.model.Download
import com.vidfriends.app.domain.model.DownloadStatus
import com.vidfriends.app.domain.model.StorageInfo
import com.vidfriends.app.domain.repository.DownloadRepository
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DownloadsViewModelTest {

    private val downloadRepository = FakeDownloadRepository()
    private val context: Context = mockk(relaxed = true)
    private lateinit var viewModel: DownloadsViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `init observes downloads from repository`() = runTest {
        downloadRepository.setDownloads(listOf(testDownload))

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        val state = viewModel.uiState.value
        assert(state.downloads.size == 1)
        assert(state.downloads[0].videoId == "v1")
    }

    @Test
    fun `init sets isLoading false after collecting`() = runTest {
        downloadRepository.setDownloads(listOf(testDownload))

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        assert(!viewModel.uiState.value.isLoading)
    }

    @Test
    fun `uiState updates when repository flow emits new values`() = runTest {
        downloadRepository.setDownloads(listOf(testDownload))

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        downloadRepository.setDownloads(
            listOf(
                testDownload.copy(status = DownloadStatus.COMPLETED, progress = 100),
            ),
        )

        val state = viewModel.uiState.value
        assert(state.downloads[0].status == DownloadStatus.COMPLETED)
        assert(state.downloads[0].progress == 100)
    }

    @Test
    fun `downloadVideo calls startDownload on repository`() = runTest {
        downloadRepository.setDownloads(emptyList())

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        viewModel.downloadVideo("v1")

        assert(downloadRepository.startedVideos.contains("v1"))
    }

    @Test
    fun `pauseDownload calls pauseDownload on repository`() = runTest {
        downloadRepository.setDownloads(listOf(testDownload))

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        viewModel.pauseDownload("v1")

        assert(downloadRepository.pausedVideos.contains("v1"))
    }

    @Test
    fun `resumeDownload calls resumeDownload on repository`() = runTest {
        downloadRepository.setDownloads(listOf(testDownload))

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        viewModel.resumeDownload("v1")

        assert(downloadRepository.resumedVideos.contains("v1"))
    }

    @Test
    fun `cancelDownload calls cancelDownload on repository`() = runTest {
        downloadRepository.setDownloads(listOf(testDownload))

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        viewModel.cancelDownload("v1")

        assert(downloadRepository.cancelledVideos.contains("v1"))
    }

    @Test
    fun `deleteDownload calls deleteDownload on repository`() = runTest {
        downloadRepository.setDownloads(listOf(testDownload))

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        viewModel.deleteDownload("v1")

        assert(downloadRepository.deletedVideos.contains("v1"))
    }

    @Test
    fun `deleteAllDownloads calls deleteAllDownloads on repository`() = runTest {
        downloadRepository.setDownloads(listOf(testDownload))

        viewModel = DownloadsViewModel(
            downloadRepository = downloadRepository,
            context = context,
        )

        viewModel.deleteAllDownloads()

        assert(downloadRepository.deleteAllDownloadCalled)
    }

    companion object {
        val testDownload = Download(
            id = "d1",
            videoId = "v1",
            localPath = null,
            status = DownloadStatus.PENDING,
            progress = 0,
            downloadedAt = null,
            fileSize = 1024000,
            mimeType = "video/mp4",
        )
    }

    private class FakeDownloadRepository : DownloadRepository {
        private val _downloads = MutableStateFlow<List<Download>>(emptyList())

        val startedVideos = mutableListOf<String>()
        val pausedVideos = mutableListOf<String>()
        val resumedVideos = mutableListOf<String>()
        val cancelledVideos = mutableListOf<String>()
        val deletedVideos = mutableListOf<String>()
        var deleteAllDownloadCalled = false

        fun setDownloads(downloads: List<Download>) {
            _downloads.value = downloads
        }

        override fun getDownloads(): Flow<List<Download>> = _downloads

        override fun getDownloadForVideo(videoId: String): Flow<Download?> =
            MutableStateFlow(_downloads.value.find { it.videoId == videoId })

        override suspend fun startDownload(videoId: String) {
            startedVideos.add(videoId)
        }

        override suspend fun pauseDownload(videoId: String) {
            pausedVideos.add(videoId)
        }

        override suspend fun resumeDownload(videoId: String) {
            resumedVideos.add(videoId)
        }

        override suspend fun cancelDownload(videoId: String) {
            cancelledVideos.add(videoId)
        }

        override suspend fun deleteDownload(videoId: String) {
            deletedVideos.add(videoId)
        }

        override suspend fun deleteAllDownloads() {
            deleteAllDownloadCalled = true
        }

        override suspend fun getStorageInfo(): StorageInfo =
            StorageInfo(availableBytes = 1000, usedBytes = 100, totalBytes = 1100)

        override suspend fun isVideoDownloaded(videoId: String): Boolean =
            _downloads.value.any { it.videoId == videoId && it.status == DownloadStatus.COMPLETED }
    }
}
