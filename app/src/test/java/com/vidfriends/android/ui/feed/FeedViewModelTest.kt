package com.vidfriends.android.ui.feed

import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.Video
import com.vidfriends.android.domain.repository.FeedRepository
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FeedViewModelTest {

    private val feedRepository: FeedRepository = mockk()
    private lateinit var viewModel: FeedViewModel

    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loadFeed loads first page on init`() = runTest {
        val videos = listOf(
            Video(id = "v1", userId = "u1", username = "user1", sourceUrl = null,
                filePath = "/v1.mp4", thumbnailPath = null, caption = "Video 1",
                duration = 1000, fileSize = 100, mimeType = "video/mp4",
                isLiked = false, likeCount = 0, commentCount = 0, createdAt = "2026-01-01"),
        )
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } returns ApiResult.Success(videos)

        viewModel = FeedViewModel(feedRepository)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals(1, state.videos.size)
        assertEquals("v1", state.videos[0].id)
        assertTrue(state.hasMore)
        assertNull(state.error)
        coVerify { feedRepository.getFeed(page = 1, limit = 10) }
    }

    @Test
    fun `loadMore loads next page and appends videos`() = runTest {
        val page1 = List(10) { i ->
            Video(id = "v$i", userId = "u1", username = "user1", sourceUrl = null,
                filePath = "/v$i.mp4", thumbnailPath = null, caption = "Video $i",
                duration = 1000, fileSize = 100, mimeType = "video/mp4",
                isLiked = false, likeCount = 0, commentCount = 0, createdAt = "2026-01-01")
        }
        val page2 = List(5) { i ->
            Video(id = "v${i + 10}", userId = "u1", username = "user1", sourceUrl = null,
                filePath = "/v${i + 10}.mp4", thumbnailPath = null, caption = "Video ${i + 10}",
                duration = 1000, fileSize = 100, mimeType = "video/mp4",
                isLiked = false, likeCount = 0, commentCount = 0, createdAt = "2026-01-01")
        }
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } returns ApiResult.Success(page1)
        coEvery { feedRepository.getFeed(page = 2, limit = 10) } returns ApiResult.Success(page2)

        viewModel = FeedViewModel(feedRepository)
        advanceUntilIdle()

        viewModel.loadMore()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(15, state.videos.size)
        assertFalse(state.hasMore)
        coVerify { feedRepository.getFeed(page = 2, limit = 10) }
    }

    @Test
    fun `loadMore guards against concurrent calls`() = runTest {
        val page1 = List(10) { i ->
            Video(id = "v$i", userId = "u1", username = "user1", sourceUrl = null,
                filePath = "/v$i.mp4", thumbnailPath = null, caption = "Video $i",
                duration = 1000, fileSize = 100, mimeType = "video/mp4",
                isLiked = false, likeCount = 0, commentCount = 0, createdAt = "2026-01-01")
        }
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } returns ApiResult.Success(page1)
        coEvery { feedRepository.getFeed(page = 2, limit = 10) } coAnswers {
            kotlinx.coroutines.delay(1000)
            ApiResult.Success(emptyList())
        }

        viewModel = FeedViewModel(feedRepository)
        advanceUntilIdle()

        viewModel.loadMore()
        viewModel.loadMore()

        assertTrue(viewModel.uiState.value.isLoadingMore)
        coVerify(invokeBlock = { exactly = 1 }) { feedRepository.getFeed(page = 2, limit = 10) }
    }

    @Test
    fun `loadMore does not load when hasMore is false`() = runTest {
        val page1 = List(3) { i ->
            Video(id = "v$i", userId = "u1", username = "user1", sourceUrl = null,
                filePath = "/v$i.mp4", thumbnailPath = null, caption = "Video $i",
                duration = 1000, fileSize = 100, mimeType = "video/mp4",
                isLiked = false, likeCount = 0, commentCount = 0, createdAt = "2026-01-01")
        }
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } returns ApiResult.Success(page1)

        viewModel = FeedViewModel(feedRepository)
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.hasMore)
        viewModel.loadMore()
        advanceUntilIdle()

        coVerify(invokeBlock = { exactly = 1 }) { feedRepository.getFeed(any(), any()) }
    }

    @Test
    fun `loadFeed shows error on failure`() = runTest {
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } returns ApiResult.Error("Network error")

        viewModel = FeedViewModel(feedRepository)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Network error", state.error)
        assertFalse(state.isLoading)
        assertTrue(state.videos.isEmpty())
    }

    @Test
    fun `loadFeed does not load while already loading`() = runTest {
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } coAnswers {
            kotlinx.coroutines.delay(1000)
            ApiResult.Success(emptyList())
        }

        viewModel = FeedViewModel(feedRepository)

        viewModel.loadFeed()
        viewModel.loadFeed()

        coVerify(invokeBlock = { exactly = 1 }) { feedRepository.getFeed(any(), any()) }
    }

    @Test
    fun `refresh clears videos and reloads from page 1`() = runTest {
        val page1 = listOf(
            Video(id = "v1", userId = "u1", username = "user1", sourceUrl = null,
                filePath = "/v1.mp4", thumbnailPath = null, caption = "Video 1",
                duration = 1000, fileSize = 100, mimeType = "video/mp4",
                isLiked = false, likeCount = 0, commentCount = 0, createdAt = "2026-01-01"),
        )
        val refreshed = listOf(
            Video(id = "v2", userId = "u1", username = "user1", sourceUrl = null,
                filePath = "/v2.mp4", thumbnailPath = null, caption = "Refreshed",
                duration = 1000, fileSize = 100, mimeType = "video/mp4",
                isLiked = false, likeCount = 0, commentCount = 0, createdAt = "2026-01-01"),
        )
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } returnsMany listOf(
            ApiResult.Success(page1),
            ApiResult.Success(refreshed),
        )

        viewModel = FeedViewModel(feedRepository)
        advanceUntilIdle()

        assertEquals("v1", viewModel.uiState.value.videos[0].id)

        viewModel.refresh()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, state.videos.size)
        assertEquals("v2", state.videos[0].id)
        coVerify(invokeBlock = { exactly = 2 }) { feedRepository.getFeed(page = 1, limit = 10) }
    }

    @Test
    fun `clearError resets error and loadMoreError`() = runTest {
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } returns ApiResult.Error("Error")

        viewModel = FeedViewModel(feedRepository)
        advanceUntilIdle()

        assertNotNull(viewModel.uiState.value.error)

        viewModel.clearError()

        assertNull(viewModel.uiState.value.error)
        assertNull(viewModel.uiState.value.loadMoreError)
    }

    @Test
    fun `loadMore sets hasMore false when response has fewer items than limit`() = runTest {
        val page1 = List(10) { i ->
            Video(id = "v$i", userId = "u1", username = "user1", sourceUrl = null,
                filePath = "/v$i.mp4", thumbnailPath = null, caption = "Video $i",
                duration = 1000, fileSize = 100, mimeType = "video/mp4",
                isLiked = false, likeCount = 0, commentCount = 0, createdAt = "2026-01-01")
        }
        coEvery { feedRepository.getFeed(page = 1, limit = 10) } returns ApiResult.Success(page1)
        coEvery { feedRepository.getFeed(page = 2, limit = 10) } returns ApiResult.Success(emptyList())

        viewModel = FeedViewModel(feedRepository)
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.hasMore)

        viewModel.loadMore()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.hasMore)
    }
}
