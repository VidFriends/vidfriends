package com.vidfriends.app.data.repository

import com.vidfriends.app.data.dto.CommentDto
import com.vidfriends.app.data.dto.VideoDto
import com.vidfriends.app.data.local.dao.CommentDao
import com.vidfriends.app.data.local.dao.VideoDao
import com.vidfriends.app.data.remote.VidFriendsApi
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class VideoRepositoryImplTest {

    private val api: VidFriendsApi = mockk()
    private val videoDao: VideoDao = mockk()
    private val commentDao: CommentDao = mockk()

    private lateinit var repository: VideoRepositoryImpl

    @Before
    fun setup() {
        repository = VideoRepositoryImpl(api, videoDao, commentDao)
    }

    @Test
    fun `getVideo returns from cache when available`() = runTest {
        coEvery { videoDao.getVideoById("v1") } returns null
        val videoDto = VideoDto(
            id = "v1", userId = "u1", username = "testuser",
            sourceUrl = null, filePath = "/v/test.mp4", thumbnailPath = null,
            caption = "Test", duration = 30000, fileSize = 1024,
            mimeType = "video/mp4", isLiked = false, likeCount = 0,
            commentCount = 0, createdAt = "2026-06-14T00:00:00Z",
        )
        coEvery { api.getVideo("v1") } returns Response.success(videoDto)
        coEvery { videoDao.insert(any()) } returns Unit

        val result = repository.getVideo("v1")

        assert(result is com.vidfriends.app.domain.model.ApiResult.Success)
        val video = (result as com.vidfriends.app.domain.model.ApiResult.Success).data
        assert(video.id == "v1")
        verify { api.getVideo("v1") }
    }

    @Test
    fun `getComments returns from API`() = runTest {
        val commentDto = CommentDto(
            id = "c1", videoId = "v1", userId = "u1",
            username = "testuser", text = "Great video!", createdAt = "2026-06-14T00:00:00Z",
        )
        coEvery { api.getComments("v1") } returns Response.success(listOf(commentDto))
        coEvery { commentDao.insertAll(any()) } returns Unit
        coEvery { commentDao.getCommentsForVideo("v1") } returns flowOf(emptyList())

        val result = repository.getComments("v1")

        assert(result is com.vidfriends.app.domain.model.ApiResult.Success)
        val comments = (result as com.vidfriends.app.domain.model.ApiResult.Success).data
        assert(comments.size == 1)
        assert(comments[0].text == "Great video!")
        verify { api.getComments("v1") }
    }

    @Test
    fun `addComment delegates to API`() = runTest {
        val commentDto = CommentDto(
            id = "c2", videoId = "v1", userId = "u1",
            username = "testuser", text = "New comment", createdAt = "2026-06-14T00:00:00Z",
        )
        coEvery { api.addComment("v1", any()) } returns Response.success(commentDto)
        coEvery { commentDao.insert(any()) } returns Unit

        val result = repository.addComment("v1", "New comment")

        assert(result is com.vidfriends.app.domain.model.ApiResult.Success)
        verify { api.addComment("v1", any()) }
    }
}
