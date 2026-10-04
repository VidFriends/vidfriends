package com.vidfriends.app.ui.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.app.data.preferences.UserPreferences
import com.vidfriends.app.domain.repository.SetupRepository
import com.vidfriends.feature.auth.SetupStatus
import com.vidfriends.feature.auth.SetupUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SetupViewModel @Inject constructor(
    private val setupRepository: SetupRepository,
    private val userPreferences: UserPreferences,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SetupUiState())
    val uiState: StateFlow<SetupUiState> = _uiState.asStateFlow()

    fun onServerUrlChanged(url: String) {
        _uiState.update { it.copy(serverUrl = url, error = null) }
    }

    fun toggleScanner() {
        _uiState.update { it.copy(showScanner = !it.showScanner) }
    }

    fun onQrCodeScanned(url: String) {
        _uiState.update { it.copy(serverUrl = url, error = null) }
        validateAndConnect(url)
    }

    fun connect() {
        val url = _uiState.value.serverUrl.trim()
        if (url.isBlank()) {
            _uiState.update { it.copy(error = "Please enter a server URL") }
            return
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            _uiState.update { it.copy(error = "URL must start with http:// or https://") }
            return
        }
        validateAndConnect(url)
    }

    private fun validateAndConnect(url: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(status = SetupStatus.Connecting, error = null) }
            val result = setupRepository.healthCheck()
            if (result is com.vidfriends.app.domain.model.ApiResult.Success) {
                userPreferences.setServerUrl(url.trimEnd('/'))
                _uiState.update { it.copy(status = SetupStatus.Connected) }
            } else {
                val error = (result as? com.vidfriends.app.domain.model.ApiResult.Error)?.message ?: "Cannot reach server"
                _uiState.update { it.copy(status = SetupStatus.Error, error = error) }
            }
        }
    }
}
