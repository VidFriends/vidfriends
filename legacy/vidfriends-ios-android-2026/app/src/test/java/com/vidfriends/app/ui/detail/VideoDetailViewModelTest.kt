package com.vidfriends.app.ui.detail

import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Comment
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.domain.repository.FeedRepository
import com.vidfriends.app.domain.repository.VideoRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
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
class VideoDetailViewModelTest {

    private val videoRepository: VideoRepository = mockk()
    private val feedRepository: FeedRepository = mockk()
    private lateinit var viewModel: VideoDetailViewModel

    private val testVideo = Video(
        id = "v1",
        userId = "u1",
        username = "testuser",
        sourceUrl = null,
        filePath = "/videos/test.mp4",
        thumbnailPath = null,
        caption = "Test caption",
        duration = 30000,
        fileSize = 1024000,
        mimeType = "video/mp4",
        isLiked = false,
        likeCount = 5,
        commentCount = 2,
        createdAt = "2026-06-14T00:00:00Z",
    )

    private val testComments = listOf(
        Comment(id = "c1", videoId = "v1", userId = "u2", username = "commenter", text = "Nice!", createdAt = "2026-06-14T01:00:00Z"),
    )

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loads video and comments on init`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(testVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(testComments)
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(
            savedStateHandle = androidx.lifecycle.SavedStateHandle(mapOf("videoId" to "v1")),
            videoRepository = videoRepository,
            feedRepository = feedRepository,
        )

        val state = viewModel.uiState.value
        assert(!state.isLoading)
        assert(state.error == null)
        assert(state.video?.id == "v1")
        assert(state.video?.username == "testuser")
        assert(state.video?.caption == "Test caption")
        assert(state.comments.size == 1)
        assert(state.comments[0].text == "Nice!")
    }

    @Test
    fun `toggleLike flips liked state and calls API`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(testVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(emptyList())
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)
        coEvery { feedRepository.likeVideo("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(
            savedStateHandle = androidx.lifecycle.SavedStateHandle(mapOf("videoId" to "v1")),
            videoRepository = videoRepository,
            feedRepository = feedRepository,
        )

        assert(!viewModel.uiState.value.isLiked)

        viewModel.toggleLike()
        assert(viewModel.uiState.value.isLiked)
        assert(viewModel.uiState.value.likeCount == 6)

        coVerify { feedRepository.likeVideo("v1") }
    }

    @Test
    fun `submitComment adds comment to list`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(testVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(emptyList())
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)

        val newComment = Comment(id = "c2", videoId = "v1", userId = "u1", username = "testuser", text = "New comment", createdAt = "2026-06-14T02:00:00Z")
        coEvery { videoRepository.addComment("v1", "New comment") } returns ApiResult.Success(newComment)

        viewModel = VideoDetailViewModel(
            savedStateHandle = androidx.lifecycle.SavedStateHandle(mapOf("videoId" to "v1")),
            videoRepository = videoRepository,
            feedRepository = feedRepository,
        )

        viewModel.onCommentTextChanged("New comment")
        viewModel.submitComment()

        assert(viewModel.uiState.value.commentText.isEmpty())
        assert(viewModel.uiState.value.comments.size == 1)
        assert(viewModel.uiState.value.comments[0].text == "New comment")
    }

    @Test
    fun `shows error when video load fails`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Error("Network error")
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(emptyList())
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(
            savedStateHandle = androidx.lifecycle.SavedStateHandle(mapOf("videoId" to "v1")),
            videoRepository = videoRepository,
            feedRepository = feedRepository,
        )

        val state = viewModel.uiState.value
        assert(!state.isLoading)
        assert(state.error == "Network error")
        assert(state.video == null)
    }
}
