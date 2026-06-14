package com.vidflow.app.domain.model

data class Comment(
    val id: String,
    val videoId: String,
    val userId: String,
    val username: String,
    val text: String,
    val createdAt: String,
)
