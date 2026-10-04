package com.vidfriends.app.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.BlockedUser
import com.vidfriends.app.domain.repository.BlockUserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BlockedUsersUiState(
    val blockedUsers: List<BlockedUser> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val isRefreshing: Boolean = false,
)

@HiltViewModel
class BlockedUsersViewModel @Inject constructor(
    private val blockUserRepository: BlockUserRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BlockedUsersUiState())
    val uiState: StateFlow<BlockedUsersUiState> = _uiState.asStateFlow()

    init {
        loadBlockedUsers()
    }

    fun loadBlockedUsers() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            when (val result = blockUserRepository.getBlockedUsers()) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        blockedUsers = result.data,
                        isLoading = false,
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = result.message,
                    )
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            when (val result = blockUserRepository.getBlockedUsers()) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        blockedUsers = result.data,
                        isRefreshing = false,
                        error = null,
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isRefreshing = false,
                        error = result.message,
                    )
                }
            }
        }
    }

    fun unblockUser(userId: String) {
        viewModelScope.launch {
            when (val result = blockUserRepository.unblockUser(userId)) {
                is ApiResult.Success -> {
                    val updated = _uiState.value.blockedUsers.filter { it.id != userId }
                    _uiState.value = _uiState.value.copy(blockedUsers = updated)
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(error = result.message)
                }
            }
        }
    }
}
