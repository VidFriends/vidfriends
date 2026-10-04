package com.vidfriends.app.ui.downloads

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidfriends.app.domain.model.DownloadStatus
import com.vidfriends.app.domain.repository.DownloadRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@Composable
fun DownloadButton(
    videoId: String,
    downloadRepository: DownloadRepository,
    scope: CoroutineScope,
    modifier: Modifier = Modifier,
) {
    val download by downloadRepository.getDownloadForVideo(videoId).collectAsState(initial = null)

    val (icon, tint, contentDesc) = when (download?.status) {
        DownloadStatus.COMPLETED -> Triple(
            Icons.Default.CheckCircle,
            Color(0xFF4CAF50),
            "Downloaded",
        )
        DownloadStatus.DOWNLOADING -> Triple(
            Icons.Default.Sync,
            Color(0xFF2196F3),
            "Downloading",
        )
        DownloadStatus.PAUSED -> Triple(
            Icons.Default.Pause,
            Color(0xFFFF9800),
            "Paused",
        )
        DownloadStatus.FAILED -> Triple(
            Icons.Default.Warning,
            Color(0xFFF44336),
            "Failed",
        )
        else -> Triple(
            Icons.Default.CloudDownload,
            Color.White.copy(alpha = 0.7f),
            "Download",
        )
    }

    IconButton(
        onClick = {
            scope.launch {
                when (download?.status) {
                    DownloadStatus.COMPLETED -> {}
                    DownloadStatus.DOWNLOADING -> {}
                    DownloadStatus.PAUSED -> downloadRepository.resumeDownload(videoId)
                    DownloadStatus.FAILED -> downloadRepository.startDownload(videoId)
                    null -> downloadRepository.startDownload(videoId)
                    else -> downloadRepository.startDownload(videoId)
                }
            }
        },
        modifier = modifier.size(48.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = icon,
                contentDescription = contentDesc,
                tint = tint,
                modifier = Modifier.size(28.dp),
            )
            val progress = download?.progress ?: 0
            if (progress in 1..99) {
                Text(
                    text = "$progress%",
                    color = tint,
                    fontSize = 9.sp,
                )
            }
        }
    }
}
