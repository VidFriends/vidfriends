package com.vidflow.app.data.repository

import com.vidflow.app.data.dto.AuthResponseDto
import com.vidflow.app.data.dto.UpdateUserRequestDto
import com.vidflow.app.data.dto.UserDto
import com.vidflow.app.data.local.dao.UserDao
import com.vidflow.app.data.preferences.UserPreferences
import com.vidflow.app.data.remote.VidFriendsApi
import com.vidflow.app.domain.model.LoginRequest
import com.vidflow.app.domain.model.RegisterRequest
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class AuthRepositoryImplTest {

    private val api: VidFriendsApi = mockk()
    private val preferences: UserPreferences = mockk()
    private val userDao: UserDao = mockk()

    private lateinit var repository: AuthRepositoryImpl

    @Before
    fun setup() {
        repository = AuthRepositoryImpl(api, preferences, userDao)
    }

    @Test
    fun `login returns success when API responds successfully`() = runTest {
        val request = LoginRequest(username = "testuser", password = "password123")
        val responseDto = AuthResponseDto(
            userId = "1",
            username = "testuser",
            accessToken = "access-token",
            refreshToken = "refresh-token",
        )
        coEvery { api.login(any()) } returns Response.success(responseDto)
        coEvery { preferences.accessToken } returns flowOf(null)
        coEvery { preferences.refreshToken } returns flowOf(null)
        coEvery { preferences.saveAuthTokens(any(), any()) } returns Unit
        coEvery { preferences.saveUserInfo(any(), any()) } returns Unit

        val result = repository.login(request)

        assert(result is com.vidflow.app.domain.model.ApiResult.Success)
        verify { api.login(any()) }
    }

    @Test
    fun `register returns success when API responds successfully`() = runTest {
        val request = RegisterRequest(
            username = "newuser",
            email = "new@test.com",
            password = "password123",
        )
        val responseDto = AuthResponseDto(
            userId = "2",
            username = "newuser",
            accessToken = "access-token",
            refreshToken = "refresh-token",
        )
        coEvery { api.register(any()) } returns Response.success(responseDto)
        coEvery { preferences.accessToken } returns flowOf(null)
        coEvery { preferences.refreshToken } returns flowOf(null)
        coEvery { preferences.saveAuthTokens(any(), any()) } returns Unit
        coEvery { preferences.saveUserInfo(any(), any()) } returns Unit

        val result = repository.register(request)

        assert(result is com.vidflow.app.domain.model.ApiResult.Success)
        verify { api.register(any()) }
    }

    @Test
    fun `updateUser returns success when API responds successfully`() = runTest {
        val userDto = UserDto(
            id = "1",
            username = "testuser",
            email = "test@test.com",
            displayName = "Updated Name",
            avatarUrl = null,
            createdAt = "2026-06-14T00:00:00Z",
        )
        coEvery { api.updateCurrentUser(any<UpdateUserRequestDto>()) } returns Response.success(userDto)
        coEvery { userDao.insert(any()) } returns Unit

        val result = repository.updateUser(displayName = "Updated Name", avatarUrl = null)

        assert(result is com.vidflow.app.domain.model.ApiResult.Success)
        val user = (result as com.vidflow.app.domain.model.ApiResult.Success).data
        assert(user.displayName == "Updated Name")
        verify { api.updateCurrentUser(any<UpdateUserRequestDto>()) }
    }
}
