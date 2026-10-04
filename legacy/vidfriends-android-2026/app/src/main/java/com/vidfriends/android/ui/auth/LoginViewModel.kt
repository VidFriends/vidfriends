package com.vidfriends.android.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.android.data.preferences.UserPreferences
import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.LoginRequest
import com.vidfriends.android.domain.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val serverUrl: String = "",
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
) {
    val isFormValid: Boolean
        get() = username.isNotBlank() && password.isNotBlank() && serverUrl.isNotBlank()
}

sealed interface LoginEvent {
    data object Authenticated : LoginEvent
    data object NavigateToRegister : LoginEvent
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val userPreferences: UserPreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    private val _events = Channel<LoginEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        viewModelScope.launch {
            val savedUrl = userPreferences.serverUrl.first()
            if (savedUrl != null) {
                _uiState.update { it.copy(serverUrl = savedUrl) }
            }
            if (authRepository.isLoggedIn()) {
                _events.send(LoginEvent.Authenticated)
            }
        }
    }

    fun onServerUrlChanged(value: String) {
        _uiState.update { it.copy(serverUrl = value, error = null) }
    }

    fun onUsernameChanged(value: String) {
        _uiState.update { it.copy(username = value, error = null) }
    }

    fun onPasswordChanged(value: String) {
        _uiState.update { it.copy(password = value, error = null) }
    }

    fun login() {
        val state = _uiState.value
        if (!state.isFormValid) {
            _uiState.update { it.copy(error = "Please fill in all fields") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            userPreferences.setServerUrl(state.serverUrl)

            when (val result = authRepository.login(LoginRequest(state.username, state.password))) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(isLoading = false) }
                    _events.send(LoginEvent.Authenticated)
                }
                is ApiResult.Error -> {
                    _uiState.update { it.copy(isLoading = false, error = result.message) }
                }
            }
        }
    }

    fun navigateToRegister() {
        viewModelScope.launch {
            _events.send(LoginEvent.NavigateToRegister)
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
