package com.vidfriends.app.data.dto

import com.vidfriends.app.domain.model.*

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
    isDuplicate = isDuplicate,
    duplicateOf = duplicateOf,
)

fun CommentDto.toDomain(): Comment = Comment(
    id = id,
    videoId = videoId,
    userId = userId,
    username = username,
    text = text,
    createdAt = createdAt,
)

fun BlockedUserDto.toDomain(): BlockedUser = BlockedUser(
    id = id,
    username = username,
    displayName = displayName,
    avatarUrl = avatarUrl,
    blockedAt = blockedAt,
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

fun CollectionDto.toDomain(): com.vidfriends.app.domain.model.Collection = com.vidfriends.app.domain.model.Collection(
    id = id,
    name = name,
    description = description,
    videoCount = videoCount,
    createdAt = createdAt,
)
