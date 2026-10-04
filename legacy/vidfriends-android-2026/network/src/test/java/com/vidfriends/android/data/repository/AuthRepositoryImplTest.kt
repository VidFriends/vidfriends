package com.vidfriends.android.data.repository

import com.vidfriends.android.data.dto.AuthResponseDto
import com.vidfriends.android.data.preferences.UserPreferences
import com.vidfriends.android.data.remote.VidFriendsApi
import com.vidfriends.android.domain.model.LoginRequest
import com.vidfriends.android.domain.model.RegisterRequest
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

    private lateinit var repository: AuthRepositoryImpl

    @Before
    fun setup() {
        repository = AuthRepositoryImpl(api, preferences)
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

        assert(result is com.vidfriends.android.domain.model.ApiResult.Success)
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

        assert(result is com.vidfriends.android.domain.model.ApiResult.Success)
        verify { api.register(any()) }
    }
}
