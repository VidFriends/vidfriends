package com.vidflow.app.domain.model

data class LoginRequest(
    val username: String,
    val password: String,
)

data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String,
    val inviteToken: String?,
)

data class AuthResult(
    val userId: String,
    val username: String,
    val accessToken: String,
    val refreshToken: String,
)

data class SendVideoRequest(
    val sourceUrl: String? = null,
    val caption: String? = null,
)
