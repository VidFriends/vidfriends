package com.vidfriends.app.data.local

import com.vidfriends.app.data.local.entity.CollectionEntity
import com.vidfriends.app.data.local.entity.CommentEntity
import com.vidfriends.app.data.local.entity.HistoryVideoEntity
import com.vidfriends.app.data.local.entity.UserEntity
import com.vidfriends.app.data.local.entity.VideoEntity
import com.vidfriends.app.domain.model.Collection
import com.vidfriends.app.domain.model.Comment
import com.vidfriends.app.domain.model.User
import com.vidfriends.app.domain.model.Video

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
    isDuplicate = isDuplicate,
    duplicateOf = duplicateOf,
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
    isDuplicate = isDuplicate,
    duplicateOf = duplicateOf,
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

fun CollectionEntity.toDomain(): Collection = Collection(
    id = id,
    name = name,
    description = description,
    videoCount = videoCount,
    createdAt = createdAt,
)

fun Collection.toEntity(): CollectionEntity = CollectionEntity(
    id = id,
    name = name,
    description = description,
    videoCount = videoCount,
    createdAt = createdAt,
)

fun HistoryVideoEntity.toDomain(): Video = Video(
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

fun Video.toHistoryEntity(): HistoryVideoEntity = HistoryVideoEntity(
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
