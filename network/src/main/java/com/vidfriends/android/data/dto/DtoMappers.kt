package com.vidfriends.android.data.dto

import com.vidfriends.android.domain.model.*

fun AuthResponseDto.toDomain(): AuthResult = AuthResult(
    userId = userId,
    username = username,
    accessToken = accessToken,
    refreshToken = refreshToken,
)

fun UserDto.toDomain(): User = User(
    id = id,
    username = username,
    email = email,
    displayName = displayName,
    avatarUrl = avatarUrl,
    createdAt = createdAt,
)

fun VideoDto.toDomain(): Video = Video(
    id = id,
    userId = userId,
    username = username,
    sourceUrl = sourceUrl,
    filePath = filePath,
    thumbnailPath = thumbnailPath,
    caption = caption,
    duration = duration,
    fileSize = fileSize,
    mimeType = mimeType,
    isLiked = isLiked,
    likeCount = likeCount,
    commentCount = commentCount,
    createdAt = createdAt,
)

fun CommentDto.toDomain(): Comment = Comment(
    id = id,
    videoId = videoId,
    userId = userId,
    username = username,
    text = text,
    createdAt = createdAt,
)

fun LoginRequest.toDto(): LoginRequestDto = LoginRequestDto(
    username = username,
    password = password,
)

fun RegisterRequest.toDto(): RegisterRequestDto = RegisterRequestDto(
    username = username,
    email = email,
    password = password,
    inviteToken = inviteToken,
)
