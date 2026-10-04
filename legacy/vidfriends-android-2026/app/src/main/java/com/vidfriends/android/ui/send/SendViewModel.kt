package com.vidfriends.android.ui.send

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.Video
import com.vidfriends.android.domain.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

data class SendUiState(
    val mode: SendMode = SendMode.URL_PASTE,
    val url: String = "",
    val caption: String = "",
    val selectedFileName: String? = null,
    val selectedFileUri: Uri? = null,
    val isSending: Boolean = false,
    val error: String? = null,
    val result: Video? = null,
)

enum class SendMode {
    URL_PASTE,
    FILE_PICKER,
}

@HiltViewModel
class SendViewModel @Inject constructor(
    private val application: Application,
    private val videoRepository: VideoRepository,
) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(SendUiState())
    val uiState: StateFlow<SendUiState> = _uiState.asStateFlow()

    fun setMode(mode: SendMode) {
        _uiState.update { it.copy(mode = mode, error = null) }
    }

    fun setUrl(url: String) {
        _uiState.update { it.copy(url = url, error = null) }
    }

    fun setCaption(caption: String) {
        _uiState.update { it.copy(caption = caption) }
    }

    fun onFileSelected(uri: Uri, fileName: String) {
        _uiState.update {
            it.copy(selectedFileUri = uri, selectedFileName = fileName, error = null)
        }
    }

    fun clearFile() {
        _uiState.update { it.copy(selectedFileUri = null, selectedFileName = null) }
    }

    fun sendLink() {
        val state = _uiState.value
        if (state.url.isBlank() || state.isSending) return

        _uiState.update { it.copy(isSending = true, error = null) }

        viewModelScope.launch {
            when (val result = videoRepository.sendLink(
                sourceUrl = state.url.trim(),
                caption = state.caption.ifBlank { null },
            )) {
                is ApiResult.Success -> {
                    _uiState.update { it.copy(isSending = false, result = result.data) }
                }
                is ApiResult.Error -> {
                    _uiState.update { it.copy(isSending = false, error = result.message) }
                }
            }
        }
    }

    fun uploadFile() {
        val state = _uiState.value
        val uri = state.selectedFileUri ?: return
        if (state.isSending) return

        _uiState.update { it.copy(isSending = true, error = null) }

        viewModelScope.launch {
            try {
                val file = uriToFile(uri, state.selectedFileName ?: "upload")
                when (val result = videoRepository.uploadFile(
                    file = file,
                    caption = state.caption.ifBlank { null },
                )) {
                    is ApiResult.Success -> {
                        file.delete()
                        _uiState.update { it.copy(isSending = false, result = result.data) }
                    }
                    is ApiResult.Error -> {
                        file.delete()
                        _uiState.update { it.copy(isSending = false, error = result.message) }
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSending = false, error = e.message ?: "Failed to upload file")
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun clearResult() {
        _uiState.update { it.copy(result = null) }
    }

    private fun uriToFile(uri: Uri, fileName: String): File {
        val inputStream = getApplication<Application>().contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("Could not open file")
        val extension = fileName.substringAfterLast('.', "mp4")
        val file = File(
            getApplication<Application>().cacheDir,
            "upload_${System.currentTimeMillis()}.$extension",
        )
        file.outputStream().use { output -> inputStream.copyTo(output) }
        inputStream.close()
        return file
    }
}
