package com.vidfriends.app.data.repository

import com.vidfriends.app.data.dto.BlockedUserDto
import com.vidfriends.app.data.dto.BlockedUsersResponseDto
import com.vidfriends.app.data.remote.VidFriendsApi
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class BlockUserRepositoryImplTest {

    private val api: VidFriendsApi = mockk()

    private lateinit var repository: BlockUserRepositoryImpl

    @Before
    fun setup() {
        repository = BlockUserRepositoryImpl(api)
    }

    @Test
    fun `blockUser returns success when API responds successfully`() = runTest {
        coEvery { api.blockUser("u1") } returns Response.success(Unit)

        val result = repository.blockUser("u1")

        assert(result is com.vidfriends.app.domain.model.ApiResult.Success)
        verify { api.blockUser("u1") }
    }

    @Test
    fun `blockUser returns error when API fails`() = runTest {
        coEvery { api.blockUser("u1") } returns Response.error(409, okhttp3.ResponseBody.create(null, "Already blocked"))

        val result = repository.blockUser("u1")

        assert(result is com.vidfriends.app.domain.model.ApiResult.Error)
        verify { api.blockUser("u1") }
    }

    @Test
    fun `unblockUser returns success when API responds successfully`() = runTest {
        coEvery { api.unblockUser("u1") } returns Response.success(Unit)

        val result = repository.unblockUser("u1")

        assert(result is com.vidfriends.app.domain.model.ApiResult.Success)
        verify { api.unblockUser("u1") }
    }

    @Test
    fun `unblockUser returns error when API fails`() = runTest {
        coEvery { api.unblockUser("u1") } returns Response.error(404, okhttp3.ResponseBody.create(null, "Not found"))

        val result = repository.unblockUser("u1")

        assert(result is com.vidfriends.app.domain.model.ApiResult.Error)
        verify { api.unblockUser("u1") }
    }

    @Test
    fun `getBlockedUsers returns mapped list when API succeeds`() = runTest {
        val dtos = listOf(
            BlockedUserDto(
                id = "u1", username = "blocked1", displayName = "Blocked One",
                avatarUrl = null, blockedAt = "2026-06-14T00:00:00Z",
            ),
            BlockedUserDto(
                id = "u2", username = "blocked2", displayName = null,
                avatarUrl = null, blockedAt = "2026-06-14T00:00:00Z",
            ),
        )
        val response = BlockedUsersResponseDto(users = dtos, page = 1, total = 2)
        coEvery { api.getBlockedUsers(page = 1, limit = 20) } returns Response.success(response)

        val result = repository.getBlockedUsers()

        assert(result is com.vidfriends.app.domain.model.ApiResult.Success)
        val users = (result as com.vidfriends.app.domain.model.ApiResult.Success).data
        assert(users.size == 2)
        assert(users[0].username == "blocked1")
        assert(users[0].displayName == "Blocked One")
        assert(users[1].username == "blocked2")
        assert(users[1].displayName == null)
        verify { api.getBlockedUsers(page = 1, limit = 20) }
    }

    @Test
    fun `getBlockedUsers returns error when API fails`() = runTest {
        coEvery { api.getBlockedUsers(page = 1, limit = 20) } returns Response.error(500, okhttp3.ResponseBody.create(null, "Server error"))

        val result = repository.getBlockedUsers()

        assert(result is com.vidfriends.app.domain.model.ApiResult.Error)
        verify { api.getBlockedUsers(page = 1, limit = 20) }
    }
}
