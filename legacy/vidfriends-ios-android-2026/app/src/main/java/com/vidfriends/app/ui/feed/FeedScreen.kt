package com.vidfriends.app.ui.feed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.ui.collections.AddToCollectionDialog
import com.vidfriends.app.ui.downloads.DownloadButton
import com.vidfriends.app.ui.feed.components.VideoPlayerWithOverlay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    onVideoClick: (String) -> Unit,
    onDuplicateClick: (String) -> Unit,
    onCollectionsClick: () -> Unit = {},
    onDownloadsClick: () -> Unit = {},
    viewModel: FeedViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val isLoadingMore by viewModel.isLoadingMore.collectAsState()
    val collections by viewModel.collections.collectAsState()
    val collectionsLoading by viewModel.collectionsLoading.collectAsState()
    var saveVideoId by remember { mutableStateOf<String?>(null) }

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
                isLoadingMore = isLoadingMore,
                onRefresh = viewModel::refresh,
                onLoadNext = viewModel::loadNextPage,
                onLikeClick = viewModel::toggleLike,
                onVideoClick = onVideoClick,
                onDuplicateClick = onDuplicateClick,
                onSaveClick = { videoId ->
                    saveVideoId = videoId
                    viewModel.loadCollections()
                },
                onCollectionsClick = onCollectionsClick,
                onDownloadsClick = onDownloadsClick,
                onBlockClick = viewModel::blockUser,
                downloadRepository = viewModel.downloadRepository,
            )
        }
    }

    saveVideoId?.let { videoId ->
        AddToCollectionDialog(
            collections = collections,
            isLoading = collectionsLoading,
            videoId = videoId,
            onDismiss = { saveVideoId = null },
            onAddToCollection = { collectionId ->
                viewModel.addVideoToCollection(collectionId, videoId)
                saveVideoId = null
            },
            onCreateCollection = { name, description ->
                viewModel.createAndAddToCollection(name, description, videoId)
                saveVideoId = null
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FeedContent(
    videos: List<Video>,
    isRefreshing: Boolean,
    isLoadingMore: Boolean,
    onRefresh: () -> Unit,
    onLoadNext: () -> Unit,
    onLikeClick: (String) -> Unit,
    onVideoClick: (String) -> Unit,
    onDuplicateClick: (String) -> Unit,
    onSaveClick: (String) -> Unit,
    onCollectionsClick: () -> Unit,
    onDownloadsClick: () -> Unit = {},
    onBlockClick: (String) -> Unit,
    downloadRepository: com.vidfriends.app.domain.repository.DownloadRepository,
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    val shouldLoadMore by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible >= videos.size - 3
        }
    }

    LaunchedEffect(shouldLoadMore, isLoadingMore) {
        if (shouldLoadMore && !isLoadingMore) onLoadNext()
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
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onCollectionsClick() }
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    Spacer(Modifier.weight(1f))
                    androidx.compose.material3.Text(
                        "Collections",
                        fontWeight = FontWeight.Medium,
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.width(4.dp))
                    androidx.compose.material3.Icon(
                        imageVector = androidx.compose.material.icons.Icons.Default.BookmarkBorder,
                        contentDescription = "Collections",
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onDownloadsClick() }
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    Spacer(Modifier.weight(1f))
                    androidx.compose.material3.Text(
                        "Downloads",
                        fontWeight = FontWeight.Medium,
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.width(4.dp))
                    androidx.compose.material3.Icon(
                        imageVector = androidx.compose.material.icons.Icons.Default.Download,
                        contentDescription = "Downloads",
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            itemsIndexed(videos, key = { _, v -> v.id }) { index, video ->
                VideoPage(
                    video = video,
                    isActive = index == listState.firstVisibleItemIndex,
                    onLikeClick = { onLikeClick(video.id) },
                    onCommentClick = { onVideoClick(video.id) },
                    onSaveClick = { onSaveClick(video.id) },
                    onDuplicateClick = { video.duplicateOf?.let { onDuplicateClick(it) } },
                    onBlockClick = { onBlockClick(video.id) },
                    downloadRepository = downloadRepository,
                    scope = scope,
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
    onSaveClick: () -> Unit,
    onDuplicateClick: () -> Unit,
    onBlockClick: (() -> Unit)? = null,
    downloadRepository: com.vidfriends.app.domain.repository.DownloadRepository,
    scope: kotlinx.coroutines.CoroutineScope,
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
            onSaveClick = onSaveClick,
            onTap = { isPaused = !isPaused },
            onDuplicateClick = onDuplicateClick,
            onBlockClick = onBlockClick,
            downloadButton = {
                DownloadButton(
                    videoId = video.id,
                    downloadRepository = downloadRepository,
                    scope = scope,
                )
            },
        )
    }
}
