package com.vidfriends.app.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.domain.repository.HistoryRepository
import com.vidfriends.app.domain.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HistoryUiState(
    val videos: List<Video> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val unsendError: String? = null,
    val showUnsendConfirm: Video? = null,
)

@HiltViewModel
class HistoryViewModel @Inject constructor(
    private val historyRepository: HistoryRepository,
    private val videoRepository: VideoRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HistoryUiState())
    val uiState: StateFlow<HistoryUiState> = _uiState.asStateFlow()

    init {
        loadHistory()
    }

    fun loadHistory() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            when (val result = historyRepository.getHistory()) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        videos = result.data,
                        isLoading = false,
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = result.message,
                    )
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            when (val result = historyRepository.getHistory()) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        videos = result.data,
                        isRefreshing = false,
                        error = null,
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isRefreshing = false,
                        error = result.message,
                    )
                }
            }
        }
    }

    fun showUnsendConfirm(video: Video) {
        _uiState.value = _uiState.value.copy(showUnsendConfirm = video)
    }

    fun dismissUnsendConfirm() {
        _uiState.value = _uiState.value.copy(showUnsendConfirm = null)
    }

    fun confirmUnsend() {
        val video = _uiState.value.showUnsendConfirm ?: return
        _uiState.value = _uiState.value.copy(showUnsendConfirm = null)

        viewModelScope.launch {
            when (val result = videoRepository.deleteVideo(video.id)) {
                is ApiResult.Success -> {
                    val updated = _uiState.value.videos.filter { it.id != video.id }
                    _uiState.value = _uiState.value.copy(
                        videos = updated,
                        unsendError = null,
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        unsendError = result.message,
                    )
                }
            }
        }
    }

    fun clearUnsendError() {
        _uiState.value = _uiState.value.copy(unsendError = null)
    }
}
