package com.vidfriends.app.ui.settings

import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.BlockedUser
import com.vidfriends.app.domain.repository.BlockUserRepository
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
class BlockedUsersViewModelTest {

    private val blockUserRepository = FakeBlockUserRepository()
    private lateinit var viewModel: BlockedUsersViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `init loads blocked users`() = runTest {
        val users = listOf(
            BlockedUser(id = "u1", username = "blocked1", displayName = "Blocked One", avatarUrl = null, blockedAt = "2026-06-14T00:00:00Z"),
        )
        blockUserRepository.setUsers(users)

        viewModel = BlockedUsersViewModel(blockUserRepository)

        val state = viewModel.uiState.value
        assert(!state.isLoading)
        assert(state.error == null)
        assert(state.blockedUsers.size == 1)
        assert(state.blockedUsers[0].username == "blocked1")
    }

    @Test
    fun `init shows error when repository fails`() = runTest {
        blockUserRepository.setError("Failed to load")

        viewModel = BlockedUsersViewModel(blockUserRepository)

        val state = viewModel.uiState.value
        assert(!state.isLoading)
        assert(state.error == "Failed to load")
        assert(state.blockedUsers.isEmpty())
    }

    @Test
    fun `refresh reloads blocked users`() = runTest {
        blockUserRepository.setUsers(emptyList())

        viewModel = BlockedUsersViewModel(blockUserRepository)

        val users = listOf(
            BlockedUser(id = "u2", username = "blocked2", displayName = null, avatarUrl = null, blockedAt = "2026-06-14T00:00:00Z"),
        )
        blockUserRepository.setUsers(users)
        viewModel.refresh()

        val state = viewModel.uiState.value
        assert(!state.isRefreshing)
        assert(state.blockedUsers.size == 1)
        assert(state.blockedUsers[0].username == "blocked2")
    }

    @Test
    fun `refresh shows error when repository fails`() = runTest {
        blockUserRepository.setUsers(emptyList())

        viewModel = BlockedUsersViewModel(blockUserRepository)

        blockUserRepository.setError("Refresh failed")
        viewModel.refresh()

        val state = viewModel.uiState.value
        assert(!state.isRefreshing)
        assert(state.error == "Refresh failed")
    }

    @Test
    fun `unblockUser removes user from list on success`() = runTest {
        val users = listOf(
            BlockedUser(id = "u1", username = "blocked1", displayName = "One", avatarUrl = null, blockedAt = "2026-06-14T00:00:00Z"),
            BlockedUser(id = "u2", username = "blocked2", displayName = "Two", avatarUrl = null, blockedAt = "2026-06-14T00:00:00Z"),
        )
        blockUserRepository.setUsers(users)

        viewModel = BlockedUsersViewModel(blockUserRepository)

        viewModel.unblockUser("u1")

        val state = viewModel.uiState.value
        assert(state.blockedUsers.size == 1)
        assert(state.blockedUsers[0].id == "u2")
    }

    @Test
    fun `unblockUser shows error on failure`() = runTest {
        blockUserRepository.setUsers(listOf(
            BlockedUser(id = "u1", username = "blocked1", displayName = "One", avatarUrl = null, blockedAt = "2026-06-14T00:00:00Z"),
        ))

        viewModel = BlockedUsersViewModel(blockUserRepository)

        blockUserRepository.setUnblockError("Network error")
        viewModel.unblockUser("u1")

        val state = viewModel.uiState.value
        assert(state.blockedUsers.size == 1)
        assert(state.error == "Network error")
    }

    private class FakeBlockUserRepository : BlockUserRepository {
        private var users: List<BlockedUser> = emptyList()
        private var error: String? = null
        private var unblockError: String? = null

        fun setUsers(users: List<BlockedUser>) {
            this.users = users
            error = null
        }

        fun setError(message: String) {
            error = message
            users = emptyList()
        }

        fun setUnblockError(message: String) {
            unblockError = message
        }

        override suspend fun getBlockedUsers(page: Int, limit: Int): ApiResult<List<BlockedUser>> {
            return error?.let { ApiResult.Error(it) } ?: ApiResult.Success(users)
        }

        override suspend fun blockUser(userId: String): ApiResult<Unit> = ApiResult.Success(Unit)

        override suspend fun unblockUser(userId: String): ApiResult<Unit> {
            return unblockError?.let { ApiResult.Error(it) } ?: ApiResult.Success(Unit)
        }
    }
}
