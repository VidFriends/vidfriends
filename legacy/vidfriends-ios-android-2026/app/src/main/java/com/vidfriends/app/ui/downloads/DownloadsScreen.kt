package com.vidfriends.app.ui.downloads

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vidfriends.app.domain.model.Download
import com.vidfriends.app.domain.model.DownloadStatus
import java.text.DecimalFormat

@Composable
fun DownloadsScreen(
    onVideoClick: (String) -> Unit,
    viewModel: DownloadsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { _ -> viewModel.checkNotificationPermission() }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!viewModel.checkNotificationPermission()) {
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            text = "Downloads",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )

        Spacer(Modifier.height(16.dp))

        state.storageInfo?.let { info ->
            StorageInfoCard(info)
            Spacer(Modifier.height(16.dp))
        }

        when {
            state.isLoading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.downloads.isEmpty() -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No downloads yet", style = MaterialTheme.typography.bodyLarge)
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            Button(
                                onClick = viewModel::deleteAllDownloads,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.error,
                                ),
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Clear All")
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }

                    items(state.downloads, key = { it.id }) { download ->
                        DownloadItem(
                            download = download,
                            onPause = { viewModel.pauseDownload(download.videoId) },
                            onResume = { viewModel.resumeDownload(download.videoId) },
                            onCancel = { viewModel.cancelDownload(download.videoId) },
                            onDelete = { viewModel.deleteDownload(download.videoId) },
                            onClick = {
                                if (download.status == DownloadStatus.COMPLETED) {
                                    onVideoClick(download.videoId)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StorageInfoCard(info: com.vidfriends.app.domain.model.StorageInfo) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Storage, contentDescription = null, modifier = Modifier.size(32.dp))
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Storage", fontWeight = FontWeight.Bold)
                Text(
                    "Used: ${formatBytes(info.usedBytes)} / Free: ${formatBytes(info.availableBytes)}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun DownloadItem(
    download: Download,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onCancel: () -> Unit,
    onDelete: () -> Unit,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Video",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        when (download.status) {
                            DownloadStatus.PENDING -> "Waiting..."
                            DownloadStatus.DOWNLOADING -> "Downloading ${download.progress}%"
                            DownloadStatus.PAUSED -> "Paused"
                            DownloadStatus.COMPLETED -> "Ready for offline playback"
                            DownloadStatus.FAILED -> "Download failed"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = when (download.status) {
                            DownloadStatus.COMPLETED -> Color(0xFF4CAF50)
                            DownloadStatus.FAILED -> MaterialTheme.colorScheme.error
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }

                when (download.status) {
                    DownloadStatus.DOWNLOADING -> {
                        IconButton(onClick = onPause) {
                            Icon(Icons.Default.Pause, "Pause")
                        }
                        IconButton(onClick = onCancel) {
                            Icon(Icons.Default.Delete, "Cancel", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    DownloadStatus.PAUSED -> {
                        IconButton(onClick = onResume) {
                            Icon(Icons.Default.PlayArrow, "Resume")
                        }
                        IconButton(onClick = onCancel) {
                            Icon(Icons.Default.Delete, "Cancel", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    DownloadStatus.COMPLETED -> {
                        IconButton(onClick = onDelete) {
                            Icon(Icons.Default.Delete, "Delete")
                        }
                    }
                    DownloadStatus.FAILED -> {
                        IconButton(onClick = onResume) {
                            Icon(Icons.Default.PlayArrow, "Retry")
                        }
                        IconButton(onClick = onDelete) {
                            Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                    DownloadStatus.PENDING -> {}
                }
            }

            if (download.status == DownloadStatus.DOWNLOADING || download.status == DownloadStatus.PAUSED) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { download.progress / 100f },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 B"
    val units = arrayOf("B", "KB", "MB", "GB")
    val digitGroups = (Math.log10(bytes.toDouble()) / Math.log10(1024.0)).toInt().coerceAtMost(units.size - 1)
    val decimal = DecimalFormat("#,##0.#")
    return "${decimal.format(bytes / Math.pow(1024.0, digitGroups.toDouble()))} ${units[digitGroups]}"
}
