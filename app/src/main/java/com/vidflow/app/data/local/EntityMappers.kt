package com.vidflow.app.data.local

import com.vidflow.app.data.local.entity.CommentEntity
import com.vidflow.app.data.local.entity.UserEntity
import com.vidflow.app.data.local.entity.VideoEntity
import com.vidflow.app.domain.model.Comment
import com.vidflow.app.domain.model.User
import com.vidflow.app.domain.model.Video

fun VideoEntity.toDomain(): Video = Video(
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

fun Video.toEntity(): VideoEntity = VideoEntity(
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

fun CommentEntity.toDomain(): Comment = Comment(
    id = id,
    videoId = videoId,
    userId = userId,
    username = username,
    text = text,
    createdAt = createdAt,
)

fun Comment.toEntity(): CommentEntity = CommentEntity(
    id = id,
    videoId = videoId,
    userId = userId,
    username = username,
    text = text,
    createdAt = createdAt,
)

fun UserEntity.toDomain(): User = User(
    id = id,
    username = username,
    email = email,
    displayName = displayName,
    avatarUrl = avatarUrl,
    createdAt = createdAt,
)

fun User.toEntity(): UserEntity = UserEntity(
    id = id,
    username = username,
    email = email,
    displayName = displayName,
    avatarUrl = avatarUrl,
    createdAt = createdAt,
)
