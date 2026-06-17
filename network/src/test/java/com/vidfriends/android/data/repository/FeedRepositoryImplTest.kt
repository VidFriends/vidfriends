package com.vidfriends.android.data.repository

import com.vidfriends.android.data.dto.FeedResponseDto
import com.vidfriends.android.data.dto.VideoDto
import com.vidfriends.android.data.local.dao.VideoDao
import com.vidfriends.android.data.remote.VidFriendsApi
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class FeedRepositoryImplTest {

    private val api: VidFriendsApi = mockk()
    private val videoDao: VideoDao = mockk()

    private lateinit var repository: FeedRepositoryImpl

    @Before
    fun setup() {
        repository = FeedRepositoryImpl(api, videoDao)
    }

    @Test
    fun `getFeed returns videos from API`() = runTest {
        val videoDto = VideoDto(
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
            likeCount = 0,
            commentCount = 0,
            createdAt = "2026-06-14T00:00:00Z",
        )
        val feedResponse = FeedResponseDto(
            videos = listOf(videoDto),
            page = 1,
            total = 1,
        )
        coEvery { api.getFeed(page = 1, limit = 10) } returns Response.success(feedResponse)
        coEvery { videoDao.insertAll(any()) } returns Unit
        coEvery { videoDao.getAllVideos() } returns flowOf(emptyList())

        val result = repository.getFeed()

        assert(result is com.vidfriends.android.domain.model.ApiResult.Success)
        val videos = (result as com.vidfriends.android.domain.model.ApiResult.Success).data
        assert(videos.size == 1)
        assert(videos[0].id == "v1")
        verify { api.getFeed(page = 1, limit = 10) }
    }

    @Test
    fun `likeVideo delegates to API`() = runTest {
        coEvery { api.likeVideo("v1") } returns Response.success(Unit)
        coEvery { videoDao.updateLikeStatus("v1", true, -1) } returns Unit

        val result = repository.likeVideo("v1")

        assert(result is com.vidfriends.android.domain.model.ApiResult.Success)
        verify { api.likeVideo("v1") }
    }
}
