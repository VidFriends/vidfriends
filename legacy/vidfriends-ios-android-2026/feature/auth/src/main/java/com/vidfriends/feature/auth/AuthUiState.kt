package com.vidfriends.feature.auth

data class AuthUiState(
    val isLogin: Boolean = true,
    val name: String = "",
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
) {
    val isFormValid: Boolean
        get() = if (isLogin) {
            email.isNotBlank() && password.isNotBlank()
        } else {
            name.isNotBlank() && email.isNotBlank() &&
                password.isNotBlank() && password == confirmPassword
        }
}

sealed interface AuthEvent {
    data object Authenticated : AuthEvent
}
