package com.vidfriends.app.domain.model

data class BlockedUser(
    val id: String,
    val username: String,
    val displayName: String?,
    val avatarUrl: String?,
    val blockedAt: String,
)
