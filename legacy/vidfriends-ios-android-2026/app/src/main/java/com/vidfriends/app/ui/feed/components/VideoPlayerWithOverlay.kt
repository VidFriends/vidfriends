package com.vidfriends.app.ui.feed.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import com.vidfriends.app.domain.model.Video

@Composable
fun VideoPlayerWithOverlay(
    video: Video,
    isPlaying: Boolean,
    onLikeClick: () -> Unit,
    onCommentClick: () -> Unit,
    onSaveClick: () -> Unit,
    onTap: () -> Unit,
    onDuplicateClick: () -> Unit,
    onBlockClick: (() -> Unit)? = null,
    downloadButton: @Composable (() -> Unit)? = null,
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
            onSaveClick = onSaveClick,
            onTap = onTap,
            onDuplicateClick = onDuplicateClick,
            onBlockClick = onBlockClick,
            downloadButton = downloadButton,
        )
    }
}
