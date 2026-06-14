package com.vidflow.app.ui.detail

import android.view.ViewGroup
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.VolumeDown
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.vidflow.app.domain.model.Comment
import kotlinx.coroutines.delay

@Composable
fun VideoDetailScreen(
    videoId: String,
    onBack: () -> Unit,
    viewModel: VideoDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val isPlaying by viewModel.isPlaying.collectAsState()
    val controlsVisible by viewModel.controlsVisible.collectAsState()
    val volume by viewModel.volume.collectAsState()
    val player = viewModel.player
    var currentPosition by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }
    var showComments by remember { mutableStateOf(false) }

    LaunchedEffect(videoId) {
        viewModel.loadVideo(videoId)
        viewModel.markWatched(videoId)
    }

    LaunchedEffect(player) {
        if (player == null) return@LaunchedEffect
        while (true) {
            delay(250)
            currentPosition = player.currentPosition
            duration = player.duration.coerceAtLeast(0L)
        }
    }

    val view = LocalView.current
    DisposableEffect(Unit) {
        val window = (view.context as? android.app.Activity)?.window
        val controller = window?.let { WindowInsetsControllerCompat(it, view) }
        controller?.hide(WindowInsetsCompat.Type.systemBars())
        controller?.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        onDispose {
            player?.pause()
            controller?.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        when {
            state.isLoading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White)
                }
            }
            state.error != null -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(state.error!!, color = Color.White, style = MaterialTheme.typography.bodyLarge)
                }
            }
            else -> {
                if (player != null) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { ctx ->
                            PlayerView(ctx).apply {
                                this.player = player
                                useController = false
                                layoutParams = ViewGroup.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                    ViewGroup.LayoutParams.MATCH_PARENT,
                                )
                                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                            }
                        },
                    )
                }

                FullScreenControls(
                    state = state,
                    isPlaying = isPlaying,
                    isVisible = controlsVisible && !showComments,
                    currentPosition = currentPosition,
                    duration = duration,
                    volume = volume,
                    onPlayPauseClick = viewModel::togglePlayPause,
                    onSeek = viewModel::seekTo,
                    onVolumeChange = viewModel::setVolume,
                    onBackClick = onBack,
                    onTap = viewModel::showControls,
                    onLikeClick = viewModel::toggleLike,
                    onCommentsClick = { showComments = true },
                )

                AnimatedVisibility(
                    visible = showComments,
                    enter = slideInVertically { it },
                    exit = slideOutVertically { it },
                    modifier = Modifier.fillMaxSize(),
                ) {
                    CommentsPanel(
                        state = state,
                        onClose = { showComments = false },
                        onCommentTextChanged = viewModel::onCommentTextChanged,
                        onSubmitComment = viewModel::submitComment,
                        onDeleteComment = viewModel::deleteComment,
                    )
                }
            }
        }
    }
}

@Composable
private fun FullScreenControls(
    state: VideoDetailUiState,
    isPlaying: Boolean,
    isVisible: Boolean,
    currentPosition: Long,
    duration: Long,
    volume: Float,
    onPlayPauseClick: () -> Unit,
    onSeek: (Long) -> Unit,
    onVolumeChange: (Float) -> Unit,
    onBackClick: () -> Unit,
    onTap: () -> Unit,
    onLikeClick: () -> Unit,
    onCommentsClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .clickable { onTap() },
    ) {
        AnimatedVisibility(
            visible = isVisible,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent),
                            ),
                        ),
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = onBackClick) {
                            Icon(Icons.Default.KeyboardArrowDown, "Back", tint = Color.White)
                        }
                        state.video?.let { video ->
                            Column(Modifier.padding(start = 8.dp)) {
                                Text(video.username, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                if (!video.caption.isNullOrBlank()) {
                                    Text(
                                        video.caption, color = Color.White.copy(alpha = 0.8f),
                                        fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }

                Box(
                    modifier = Modifier.align(Alignment.Center),
                ) {
                    IconButton(
                        onClick = onPlayPauseClick,
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.5f)),
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            tint = Color.White, modifier = Modifier.size(40.dp),
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f)),
                            ),
                        )
                        .padding(top = 24.dp, bottom = 12.dp),
                ) {
                    var seekFraction by remember { mutableFloatStateOf(0f) }
                    var isSeeking by remember { mutableStateOf(false) }

                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                        Slider(
                            value = if (isSeeking) seekFraction else if (duration > 0) (currentPosition.toFloat() / duration.toFloat()) else 0f,
                            onValueChange = { seekFraction = it; isSeeking = true },
                            onValueChangeFinished = { isSeeking = false; onSeek((seekFraction * duration).toLong()) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = SliderDefaults.colors(
                                thumbColor = Color.White,
                                activeTrackColor = Color.White,
                                inactiveTrackColor = Color.White.copy(alpha = 0.3f),
                            ),
                        )
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = onPlayPauseClick, modifier = Modifier.size(40.dp)) {
                                    Icon(
                                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                        contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp),
                                    )
                                }
                                Column(verticalAlignment = Alignment.CenterVertically) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        IconButton(
                                            onClick = {
                                                val newVol = if (volume > 0f) 0f else 1f
                                                onVolumeChange(newVol)
                                            },
                                            modifier = Modifier.size(32.dp),
                                        ) {
                                            Icon(
                                                imageVector = if (volume > 0f) Icons.Default.VolumeUp else Icons.Default.VolumeDown,
                                                contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp),
                                            )
                                        }
                                        Slider(
                                            value = volume,
                                            onValueChange = onVolumeChange,
                                            modifier = Modifier.width(72.dp),
                                            colors = SliderDefaults.colors(
                                                thumbColor = Color.White,
                                                activeTrackColor = Color.White,
                                                inactiveTrackColor = Color.White.copy(alpha = 0.3f),
                                            ),
                                        )
                                    }
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                IconButton(onClick = onLikeClick, modifier = Modifier.size(40.dp)) {
                                    Icon(
                                        imageVector = if (state.isLiked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                        contentDescription = null,
                                        tint = if (state.isLiked) Color(0xFFFF1744) else Color.White,
                                        modifier = Modifier.size(24.dp),
                                    )
                                }
                                IconButton(onClick = onCommentsClick, modifier = Modifier.size(40.dp)) {
                                    Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                                }
                            }
                        }
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                "${formatDuration(currentPosition)} / ${formatDuration(duration)}",
                                color = Color.White, fontSize = 11.sp,
                            )
                            Text(
                                "${state.likeCount}", color = Color.White, fontSize = 11.sp,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CommentsPanel(
    state: VideoDetailUiState,
    onClose: () -> Unit,
    onCommentTextChanged: (String) -> Unit,
    onSubmitComment: () -> Unit,
    onDeleteComment: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.85f)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose) {
                Icon(Icons.Default.KeyboardArrowDown, "Close", tint = Color.White)
            }
            Text("Comments", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
        ) {
            items(state.comments, key = { it.id }) { comment ->
                CommentItem(comment = comment, onDelete = { onDeleteComment(comment.id) })
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = state.commentText,
                onValueChange = onCommentTextChanged,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Add a comment...") },
                singleLine = true,
                enabled = !state.isSubmittingComment,
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
                onClick = onSubmitComment,
                enabled = state.commentText.isNotBlank() && !state.isSubmittingComment,
            ) {
                Icon(Icons.Default.Send, "Send", tint = Color.White)
            }
        }
    }
}

@Composable
private fun CommentItem(comment: Comment, onDelete: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(Modifier.weight(1f)) {
            Text(comment.username, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = Color.White)
            Text(comment.text, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
        }
        IconButton(onClick = onDelete, modifier = Modifier.size(32.dp)) {
            Icon(Icons.Default.Delete, "Delete", tint = Color.White.copy(alpha = 0.6f), modifier = Modifier.size(16.dp))
        }
    }
}

private fun formatDuration(durationMs: Long): String {
    val totalSeconds = durationMs / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%d:%02d".format(minutes, seconds)
}
