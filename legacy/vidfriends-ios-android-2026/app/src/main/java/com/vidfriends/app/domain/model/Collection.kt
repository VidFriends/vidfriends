package com.vidfriends.app.domain.model

data class Collection(
    val id: String,
    val name: String,
    val description: String?,
    val videoCount: Int,
    val createdAt: String,
)
