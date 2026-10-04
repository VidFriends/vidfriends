package com.vidfriends.app.ui.collections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.vidfriends.app.domain.model.Video

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionDetailScreen(
    collectionId: String,
    onBack: () -> Unit,
    onVideoClick: (String) -> Unit,
    viewModel: CollectionDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(collectionId) {
        viewModel.loadCollection(collectionId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(uiState.collection?.name ?: "Collection")
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { paddingValues ->
        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            uiState.error != null && uiState.videos.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = uiState.error!!,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            uiState.videos.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Default.Bookmark,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "No videos yet",
                            style = MaterialTheme.typography.headlineSmall,
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Add videos from your feed",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            else -> {
                PullToRefreshBox(
                    isRefreshing = uiState.isRefreshing,
                    onRefresh = { viewModel.refresh(collectionId) },
                    modifier = Modifier.fillMaxSize().padding(paddingValues),
                ) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(4.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(uiState.videos, key = { it.id }) { video ->
                            CollectionVideoItem(
                                video = video,
                                onClick = { onVideoClick(video.id) },
                                onRemove = { viewModel.removeVideo(collectionId, video.id) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CollectionVideoItem(
    video: Video,
    onClick: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier.padding(4.dp),
    ) {
        Box {
            AsyncImage(
                model = video.thumbnailPath ?: video.filePath,
                contentDescription = video.caption ?: "Video",
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(9f / 16f),
                contentScale = ContentScale.Crop,
            )

            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp),
            ) {
                IconButton(
                    onClick = onRemove,
                    modifier = Modifier.size(28.dp),
                ) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Remove from collection",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }

            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .padding(8.dp),
            ) {
                Text(
                    text = video.username,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = MaterialTheme.typography.labelSmall.fontSize,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
