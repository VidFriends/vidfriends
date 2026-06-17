package com.vidfriends.app.data.repository

import com.vidfriends.app.data.dto.HealthResponseDto
import com.vidfriends.app.data.remote.VidFriendsApi
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class SetupRepositoryImplTest {

    private val api: VidFriendsApi = mockk()

    private lateinit var repository: SetupRepositoryImpl

    @Before
    fun setup() {
        repository = SetupRepositoryImpl(api)
    }

    @Test
    fun `healthCheck returns success when API responds ok`() = runTest {
        coEvery { api.healthCheck() } returns Response.success(HealthResponseDto(status = "ok"))

        val result = repository.healthCheck()

        assert(result is com.vidfriends.app.domain.model.ApiResult.Success)
        verify { api.healthCheck() }
    }

    @Test
    fun `healthCheck returns error when API fails`() = runTest {
        coEvery { api.healthCheck() } throws Exception("Server error")

        val result = repository.healthCheck()

        assert(result is com.vidfriends.app.domain.model.ApiResult.Error)
        val error = result as com.vidfriends.app.domain.model.ApiResult.Error
        assert(error.message == "Server error")
        verify { api.healthCheck() }
    }
}
