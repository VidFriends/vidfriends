package com.vidfriends.feature.auth

sealed interface SetupStatus {
    data object Idle : SetupStatus
    data object Connecting : SetupStatus
    data object Connected : SetupStatus
    data object Error : SetupStatus
}

data class SetupUiState(
    val serverUrl: String = "",
    val status: SetupStatus = SetupStatus.Idle,
    val error: String? = null,
    val showScanner: Boolean = false,
)
