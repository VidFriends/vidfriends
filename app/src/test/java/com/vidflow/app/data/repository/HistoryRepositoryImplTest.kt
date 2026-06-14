package com.vidflow.app.data.repository

import com.vidflow.app.data.dto.HistoryResponseDto
import com.vidflow.app.data.dto.VideoDto
import com.vidflow.app.data.local.dao.VideoDao
import com.vidflow.app.data.remote.VidFriendsApi
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class HistoryRepositoryImplTest {

    private val api: VidFriendsApi = mockk()
    private val videoDao: VideoDao = mockk()

    private lateinit var repository: HistoryRepositoryImpl

    @Before
    fun setup() {
        repository = HistoryRepositoryImpl(api, videoDao)
    }

    @Test
    fun `getHistory returns videos from API`() = runTest {
        val videoDto = VideoDto(
            id = "v1", userId = "u1", username = "testuser",
            sourceUrl = null, filePath = "/v/test.mp4", thumbnailPath = null,
            caption = "Test", duration = 30000, fileSize = 1024,
            mimeType = "video/mp4", isLiked = false, likeCount = 0,
            commentCount = 0, createdAt = "2026-06-14T00:00:00Z",
        )
        val historyResponse = HistoryResponseDto(
            videos = listOf(videoDto), page = 1, total = 1,
        )
        coEvery { api.getHistory(page = 1, limit = 20) } returns Response.success(historyResponse)
        coEvery { videoDao.insertAll(any()) } returns Unit
        coEvery { videoDao.getAllVideos() } returns flowOf(emptyList())

        val result = repository.getHistory()

        assert(result is com.vidflow.app.domain.model.ApiResult.Success)
        val videos = (result as com.vidflow.app.domain.model.ApiResult.Success).data
        assert(videos.size == 1)
        assert(videos[0].id == "v1")
        verify { api.getHistory(page = 1, limit = 20) }
    }

    @Test
    fun `clearHistory deletes all videos`() = runTest {
        coEvery { videoDao.deleteAll() } returns Unit

        val result = repository.clearHistory()

        assert(result is com.vidflow.app.domain.model.ApiResult.Success)
        verify { videoDao.deleteAll() }
    }
}
