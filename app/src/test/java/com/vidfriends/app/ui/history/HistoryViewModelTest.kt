package com.vidfriends.app.ui.history

import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.domain.repository.HistoryRepository
import com.vidfriends.app.domain.repository.VideoRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HistoryViewModelTest {

    private val historyRepository = FakeHistoryRepository()
    private val videoRepository = FakeVideoRepository()
    private lateinit var viewModel: HistoryViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loadHistory shows videos on init`() = runTest {
        historyRepository.setVideos(listOf(testVideo))

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        val state = viewModel.uiState.value
        assert(!state.isLoading)
        assert(state.error == null)
        assert(state.videos.size == 1)
        assert(state.videos[0].id == "v1")
    }

    @Test
    fun `loadHistory shows error when repository fails`() = runTest {
        historyRepository.setError("Failed to load history")

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        val state = viewModel.uiState.value
        assert(!state.isLoading)
        assert(state.error == "Failed to load history")
    }

    @Test
    fun `refresh reloads history and clears error`() = runTest {
        historyRepository.setVideos(listOf(testVideo))

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        historyRepository.setVideos(listOf(testVideo.copy(id = "v2")))
        viewModel.refresh()

        val state = viewModel.uiState.value
        assert(!state.isRefreshing)
        assert(state.error == null)
        assert(state.videos[0].id == "v2")
    }

    @Test
    fun `refresh shows error when refresh fails`() = runTest {
        historyRepository.setVideos(listOf(testVideo))

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        historyRepository.setError("Refresh failed")
        viewModel.refresh()

        assert(viewModel.uiState.value.error == "Refresh failed")
    }

    @Test
    fun `showUnsendConfirm sets the confirmation video`() = runTest {
        historyRepository.setVideos(listOf(testVideo))

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        viewModel.showUnsendConfirm(testVideo)

        assert(viewModel.uiState.value.showUnsendConfirm == testVideo)
    }

    @Test
    fun `dismissUnsendConfirm clears confirmation video`() = runTest {
        historyRepository.setVideos(listOf(testVideo))

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        viewModel.showUnsendConfirm(testVideo)
        viewModel.dismissUnsendConfirm()

        assert(viewModel.uiState.value.showUnsendConfirm == null)
    }

    @Test
    fun `confirmUnsend calls deleteVideo and removes video from list`() = runTest {
        historyRepository.setVideos(listOf(testVideo))
        videoRepository.setDeleteResult(ApiResult.Success(Unit))

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        viewModel.showUnsendConfirm(testVideo)
        viewModel.confirmUnsend()

        val state = viewModel.uiState.value
        assert(state.showUnsendConfirm == null)
        assert(state.videos.isEmpty())
        assert(state.unsendError == null)
    }

    @Test
    fun `confirmUnsend sets error when deleteVideo fails`() = runTest {
        historyRepository.setVideos(listOf(testVideo))
        videoRepository.setDeleteResult(ApiResult.Error("Delete failed"))

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        viewModel.showUnsendConfirm(testVideo)
        viewModel.confirmUnsend()

        val state = viewModel.uiState.value
        assert(state.showUnsendConfirm == null)
        assert(state.unsendError == "Delete failed")
    }

    @Test
    fun `clearUnsendError resets unsend error`() = runTest {
        historyRepository.setVideos(listOf(testVideo))
        videoRepository.setDeleteResult(ApiResult.Error("Delete failed"))

        viewModel = HistoryViewModel(
            historyRepository = historyRepository,
            videoRepository = videoRepository,
        )

        viewModel.showUnsendConfirm(testVideo)
        viewModel.confirmUnsend()
        viewModel.clearUnsendError()

        assert(viewModel.uiState.value.unsendError == null)
    }

    companion object {
        val testVideo = Video(
            id = "v1",
            userId = "u1",
            username = "testuser",
            sourceUrl = null,
            filePath = "/videos/test.mp4",
            thumbnailPath = null,
            caption = "Test video",
            duration = 30000,
            fileSize = 1024000,
            mimeType = "video/mp4",
            isLiked = false,
            likeCount = 5,
            commentCount = 2,
            createdAt = "2026-06-14T00:00:00Z",
        )
    }

    private class FakeHistoryRepository : HistoryRepository {
        private var response: ApiResult<List<Video>> = ApiResult.Success(emptyList())

        fun setVideos(videos: List<Video>) {
            response = ApiResult.Success(videos)
        }

        fun setError(message: String) {
            response = ApiResult.Error(message)
        }

        override suspend fun getHistory(page: Int, limit: Int): ApiResult<List<Video>> = response

        override suspend fun clearHistory(): ApiResult<Unit> = ApiResult.Success(Unit)
    }

    private class FakeVideoRepository : VideoRepository {
        private var deleteResult: ApiResult<Unit> = ApiResult.Success(Unit)

        fun setDeleteResult(result: ApiResult<Unit>) {
            deleteResult = result
        }

        override suspend fun getVideo(id: String): ApiResult<Video> = ApiResult.Error("not implemented")

        override suspend fun sendLink(sourceUrl: String, caption: String?): ApiResult<Video> =
            ApiResult.Error("not implemented")

        override suspend fun uploadFile(file: java.io.File, caption: String?): ApiResult<Video> =
            ApiResult.Error("not implemented")

        override suspend fun getComments(videoId: String): ApiResult<List<com.vidfriends.app.domain.model.Comment>> =
            ApiResult.Success(emptyList())

        override suspend fun addComment(videoId: String, text: String): ApiResult<com.vidfriends.app.domain.model.Comment> =
            ApiResult.Error("not implemented")

        override suspend fun deleteComment(videoId: String, commentId: String): ApiResult<Unit> =
            ApiResult.Success(Unit)

        override suspend fun deleteVideo(videoId: String): ApiResult<Unit> = deleteResult

        override suspend fun getVideoStatus(videoId: String): ApiResult<String> =
            ApiResult.Success("ready")
    }
}
