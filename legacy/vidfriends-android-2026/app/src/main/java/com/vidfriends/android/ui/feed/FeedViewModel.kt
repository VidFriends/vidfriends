package com.vidfriends.android.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.Video
import com.vidfriends.android.domain.repository.FeedRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FeedUiState(
    val videos: List<Video> = emptyList(),
    val isLoading: Boolean = false,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val loadMoreError: String? = null,
    val hasMore: Boolean = true,
)

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val feedRepository: FeedRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedUiState())
    val uiState: StateFlow<FeedUiState> = _uiState.asStateFlow()

    private var currentPage = 1

    init {
        loadFeed()
    }

    fun loadFeed() {
        val state = _uiState.value
        if (state.isLoading) return

        _uiState.update { it.copy(isLoading = true, error = null) }
        currentPage = 1

        viewModelScope.launch {
            when (val result = feedRepository.getFeed(page = currentPage)) {
                is ApiResult.Success -> {
                    currentPage++
                    _uiState.update {
                        it.copy(
                            videos = result.data,
                            isLoading = false,
                            hasMore = result.data.size >= 10,
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update {
                        it.copy(isLoading = false, error = result.message)
                    }
                }
            }
        }
    }

    fun loadMore() {
        val state = _uiState.value
        if (state.isLoadingMore) return
        if (!state.hasMore) return

        _uiState.update { it.copy(isLoadingMore = true, loadMoreError = null) }

        viewModelScope.launch {
            when (val result = feedRepository.getFeed(page = currentPage)) {
                is ApiResult.Success -> {
                    if (result.data.isEmpty()) {
                        _uiState.update { it.copy(isLoadingMore = false, hasMore = false) }
                    } else {
                        currentPage++
                        _uiState.update {
                            it.copy(
                                videos = it.videos + result.data,
                                isLoadingMore = false,
                                hasMore = result.data.size >= 10,
                            )
                        }
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update {
                        it.copy(isLoadingMore = false, loadMoreError = result.message)
                    }
                }
            }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null, loadMoreError = null) }
    }

    fun refresh() {
        loadFeed()
    }
}
