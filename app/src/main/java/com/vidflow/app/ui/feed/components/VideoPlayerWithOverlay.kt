package com.vidflow.app.ui.feed.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import com.vidflow.app.domain.model.Video

@Composable
fun VideoPlayerWithOverlay(
    video: Video,
    isPlaying: Boolean,
    onLikeClick: () -> Unit,
    onCommentClick: () -> Unit,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        val videoUrl = video.filePath.ifBlank { video.sourceUrl ?: "" }

        if (isPlaying && videoUrl.isNotBlank()) {
            VideoPlayer(
                videoUrl = videoUrl,
                isPlaying = true,
            )
        } else {
            val thumbnailUrl = video.thumbnailPath
            if (!thumbnailUrl.isNullOrBlank()) {
                AsyncImage(
                    model = thumbnailUrl,
                    contentDescription = video.caption ?: "Video thumbnail",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }
        }

        VideoOverlay(
            video = video,
            isPlaying = isPlaying,
            onLikeClick = onLikeClick,
            onCommentClick = onCommentClick,
            onTap = onTap,
        )
    }
}
