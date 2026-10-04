package com.vidfriends.android.data.local

import com.vidfriends.android.data.local.entity.CommentEntity
import com.vidfriends.android.data.local.entity.VideoEntity
import com.vidfriends.android.domain.model.Comment
import com.vidfriends.android.domain.model.Video

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
