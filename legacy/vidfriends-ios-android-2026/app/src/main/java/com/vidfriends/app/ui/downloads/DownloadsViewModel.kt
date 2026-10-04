package com.vidfriends.app.ui.downloads

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.app.domain.model.Download
import com.vidfriends.app.domain.model.DownloadStatus
import com.vidfriends.app.domain.model.StorageInfo
import com.vidfriends.app.domain.repository.DownloadRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DownloadsUiState(
    val downloads: List<Download> = emptyList(),
    val storageInfo: StorageInfo? = null,
    val isLoading: Boolean = true,
    val needsNotificationPermission: Boolean = false,
)

@HiltViewModel
class DownloadsViewModel @Inject constructor(
    private val downloadRepository: DownloadRepository,
    @ApplicationContext private val context: android.content.Context,
) : ViewModel() {

    fun checkNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        _uiState.value = _uiState.value.copy(needsNotificationPermission = !granted)
        return granted
    }

    private val _uiState = MutableStateFlow(DownloadsUiState())
    val uiState: StateFlow<DownloadsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            downloadRepository.getDownloads().collect { downloads ->
                _uiState.value = _uiState.value.copy(
                    downloads = downloads,
                    isLoading = false,
                )
            }
        }
        loadStorageInfo()
    }

    fun downloadVideo(videoId: String) {
        if (!checkNotificationPermission()) return
        viewModelScope.launch {
            downloadRepository.startDownload(videoId)
        }
    }

    fun pauseDownload(videoId: String) {
        viewModelScope.launch {
            downloadRepository.pauseDownload(videoId)
        }
    }

    fun resumeDownload(videoId: String) {
        viewModelScope.launch {
            downloadRepository.resumeDownload(videoId)
        }
    }

    fun cancelDownload(videoId: String) {
        viewModelScope.launch {
            downloadRepository.cancelDownload(videoId)
        }
    }

    fun deleteDownload(videoId: String) {
        viewModelScope.launch {
            downloadRepository.deleteDownload(videoId)
        }
    }

    fun deleteAllDownloads() {
        viewModelScope.launch {
            downloadRepository.deleteAllDownloads()
            loadStorageInfo()
        }
    }

    fun loadStorageInfo() {
        viewModelScope.launch {
            val info = downloadRepository.getStorageInfo()
            _uiState.value = _uiState.value.copy(storageInfo = info)
        }
    }
}
