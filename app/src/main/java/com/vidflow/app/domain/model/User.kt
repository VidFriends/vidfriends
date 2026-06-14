package com.vidflow.app.domain.model

data class User(
    val id: String,
    val username: String,
    val email: String,
    val displayName: String?,
    val avatarUrl: String?,
    val createdAt: String,
)
