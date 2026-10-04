package com.vidfriends.android.ui.detail

import android.app.Application
import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.Comment
import com.vidfriends.android.domain.model.Video
import com.vidfriends.android.domain.repository.FeedRepository
import com.vidfriends.android.domain.repository.VideoRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VideoDetailViewModelTest {

    private val videoRepository: VideoRepository = mockk()
    private val feedRepository: FeedRepository = mockk()
    private val application: Application = mockk()

    private lateinit var viewModel: VideoDetailViewModel

    private val testDispatcher = StandardTestDispatcher()

    private val sampleVideo = Video(
        id = "v1",
        userId = "u1",
        username = "user1",
        sourceUrl = "https://example.com/video.mp4",
        filePath = "",
        thumbnailPath = null,
        caption = "Test Video",
        duration = 1000,
        fileSize = 100,
        mimeType = "video/mp4",
        isLiked = false,
        likeCount = 5,
        commentCount = 2,
        createdAt = "2026-01-01",
    )

    private val sampleComments = listOf(
        Comment(id = "c1", videoId = "v1", userId = "u2", username = "commenter1", text = "Nice video!", createdAt = "2026-01-02"),
        Comment(id = "c2", videoId = "v1", userId = "u3", username = "commenter2", text = "Great!", createdAt = "2026-01-03"),
    )

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loadVideo fetches video and comments, updates state`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(sampleVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(sampleComments)
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertNull(state.error)
        assertEquals("Test Video", state.video?.caption)
        assertFalse(state.isLiked)
        assertEquals(5, state.likeCount)
        assertEquals(2, state.comments.size)
        coVerify { videoRepository.getVideo("v1") }
        coVerify { videoRepository.getComments("v1") }
    }

    @Test
    fun `loadVideo sets error when request fails`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Error("Network error")

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals("Network error", state.error)
        assertNull(state.video)
    }

    @Test
    fun `toggleLike flips isLiked and updates likeCount optimistically`() = runTest {
        val likedVideo = sampleVideo.copy(isLiked = false, likeCount = 5)
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(likedVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(emptyList())
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)
        coEvery { feedRepository.likeVideo("v1") } returns ApiResult.Success(Unit)
        coEvery { feedRepository.unlikeVideo("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        advanceUntilIdle()

        viewModel.toggleLike()
        advanceUntilIdle()
        var state = viewModel.uiState.value
        assertTrue(state.isLiked)
        assertEquals(6, state.likeCount)

        viewModel.toggleLike()
        advanceUntilIdle()
        state = viewModel.uiState.value
        assertFalse(state.isLiked)
        assertEquals(5, state.likeCount)

        coVerify(exactly = 1) { feedRepository.likeVideo("v1") }
        coVerify(exactly = 1) { feedRepository.unlikeVideo("v1") }
    }

    @Test
    fun `submitComment adds comment to list and clears input`() = runTest {
        val newComment = Comment(id = "c3", videoId = "v1", userId = "u1", username = "user1", text = "New comment", createdAt = "2026-01-04")
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(sampleVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(sampleComments)
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)
        coEvery { videoRepository.addComment("v1", "New comment") } returns ApiResult.Success(newComment)

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        advanceUntilIdle()

        viewModel.onCommentTextChanged("New comment")
        assertEquals("New comment", viewModel.uiState.value.commentText)

        viewModel.submitComment()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(3, state.comments.size)
        assertTrue(state.comments.any { it.id == "c3" })
        assertEquals("", state.commentText)
    }

    @Test
    fun `deleteComment removes comment from list`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(sampleVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(sampleComments)
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)
        coEvery { videoRepository.deleteComment("v1", "c1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        advanceUntilIdle()

        assertEquals(2, viewModel.uiState.value.comments.size)

        viewModel.deleteComment("c1")
        advanceUntilIdle()

        assertEquals(1, viewModel.uiState.value.comments.size)
        assertFalse(viewModel.uiState.value.comments.any { it.id == "c1" })
        coVerify { videoRepository.deleteComment("v1", "c1") }
    }

    @Test
    fun `markWatched is called on first load`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(sampleVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(emptyList())
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        viewModel.markWatched("v1")
        advanceUntilIdle()

        coVerify { feedRepository.markWatched("v1") }
    }

    @Test
    fun `submitComment does nothing with empty text`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(sampleVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(sampleComments)
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        advanceUntilIdle()

        assertEquals(2, viewModel.uiState.value.comments.size)

        viewModel.submitComment()
        advanceUntilIdle()

        assertEquals(2, viewModel.uiState.value.comments.size)
    }

    @Test
    fun `loadComments fetches comments successfully`() = runTest {
        val singleComment = listOf(
            Comment(id = "c1", videoId = "v1", userId = "u2", username = "commenter1", text = "Nice!", createdAt = "2026-01-02"),
        )
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(sampleVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(singleComment)
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        advanceUntilIdle()

        assertEquals(1, viewModel.uiState.value.comments.size)
        assertEquals("Nice!", viewModel.uiState.value.comments[0].text)
    }

    @Test
    fun `loadVideo does not clear existing comments when reloading`() = runTest {
        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(sampleVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(sampleComments)
        coEvery { feedRepository.markWatched("v1") } returns ApiResult.Success(Unit)

        viewModel = VideoDetailViewModel(videoRepository, feedRepository, application)
        viewModel.loadVideo("v1")
        advanceUntilIdle()

        assertEquals(2, viewModel.uiState.value.comments.size)

        coEvery { videoRepository.getVideo("v1") } returns ApiResult.Success(sampleVideo)
        coEvery { videoRepository.getComments("v1") } returns ApiResult.Success(sampleComments)

        viewModel.loadVideo("v1")
        advanceUntilIdle()

        assertEquals(2, viewModel.uiState.value.comments.size)
    }
}
