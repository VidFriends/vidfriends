package com.vidflow.app.ui.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vidflow.app.domain.model.Video
import com.vidflow.app.ui.feed.components.VideoPlayerWithOverlay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    onVideoClick: (String) -> Unit,
    viewModel: FeedViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    when (val state = uiState) {
        is FeedUiState.Loading -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Loading...", style = MaterialTheme.typography.headlineSmall)
            }
        }
        is FeedUiState.Error -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = state.message,
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
        is FeedUiState.Empty -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No videos yet", style = MaterialTheme.typography.headlineSmall)
            }
        }
        is FeedUiState.AllCaughtUp -> {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("All caught up!", style = MaterialTheme.typography.headlineSmall)
            }
        }
        is FeedUiState.Success -> {
            FeedContent(
                videos = state.videos,
                isRefreshing = state.isRefreshing,
                onRefresh = viewModel::refresh,
                onLoadNext = viewModel::loadNextPage,
                onLikeClick = viewModel::toggleLike,
                onVideoClick = onVideoClick,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FeedContent(
    videos: List<Video>,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onLoadNext: () -> Unit,
    onLikeClick: (String) -> Unit,
    onVideoClick: (String) -> Unit,
) {
    val listState = rememberLazyListState()

    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible >= videos.size - 3
        }
    }

    LaunchedEffect(shouldLoadMore) {
        if (shouldLoadMore) onLoadNext()
    }

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
        ) {
            itemsIndexed(videos, key = { _, v -> v.id }) { index, video ->
                VideoPage(
                    video = video,
                    isActive = index == listState.firstVisibleItemIndex,
                    onLikeClick = { onLikeClick(video.id) },
                    onCommentClick = { onVideoClick(video.id) },
                )
            }
        }
    }
}

@Composable
private fun VideoPage(
    video: Video,
    isActive: Boolean,
    onLikeClick: () -> Unit,
    onCommentClick: () -> Unit,
) {
    var isPaused by remember { mutableStateOf(false) }
    val isPlaying = isActive && !isPaused

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(800.dp),
    ) {
        VideoPlayerWithOverlay(
            video = video,
            isPlaying = isPlaying,
            onLikeClick = onLikeClick,
            onCommentClick = onCommentClick,
            onTap = { isPaused = !isPaused },
        )
    }
}
