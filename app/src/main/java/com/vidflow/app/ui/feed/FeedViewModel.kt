package com.vidflow.app.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidflow.app.domain.model.ApiResult
import com.vidflow.app.domain.repository.FeedRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val feedRepository: FeedRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<FeedUiState>(FeedUiState.Loading)
    val uiState: StateFlow<FeedUiState> = _uiState.asStateFlow()

    private var currentPage = 1
    private var hasMore = true
    private val allVideos = mutableListOf<com.vidflow.app.domain.model.Video>()

    init {
        loadFeed()
    }

    fun loadFeed() {
        viewModelScope.launch {
            _uiState.value = FeedUiState.Loading
            currentPage = 1
            hasMore = true
            allVideos.clear()

            when (val result = feedRepository.getFeed(page = currentPage, limit = 10)) {
                is ApiResult.Success -> {
                    allVideos.addAll(result.data)
                    if (result.data.isEmpty()) {
                        _uiState.value = FeedUiState.Empty
                    } else {
                        _uiState.value = FeedUiState.Success(videos = allVideos.toList())
                    }
                    hasMore = result.data.size >= 10
                }
                is ApiResult.Error -> {
                    _uiState.value = FeedUiState.Error(result.message)
                }
            }
        }
    }

    fun loadNextPage() {
        if (!hasMore) return
        viewModelScope.launch {
            currentPage++
            when (val result = feedRepository.getFeed(page = currentPage, limit = 10)) {
                is ApiResult.Success -> {
                    allVideos.addAll(result.data)
                    hasMore = result.data.size >= 10
                    if (allVideos.isEmpty()) {
                        _uiState.value = FeedUiState.AllCaughtUp
                    } else {
                        _uiState.value = FeedUiState.Success(videos = allVideos.toList())
                    }
                }
                is ApiResult.Error -> {
                    currentPage--
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            val current = _uiState.value
            if (current is FeedUiState.Success) {
                _uiState.value = current.copy(isRefreshing = true)
            }
            currentPage = 1
            hasMore = true
            allVideos.clear()

            when (val result = feedRepository.getFeed(page = 1, limit = 10)) {
                is ApiResult.Success -> {
                    allVideos.addAll(result.data)
                    hasMore = result.data.size >= 10
                    _uiState.value = if (allVideos.isEmpty()) FeedUiState.Empty
                    else FeedUiState.Success(videos = allVideos.toList())
                }
                is ApiResult.Error -> {
                    _uiState.value = FeedUiState.Error(result.message)
                }
            }
        }
    }

    fun toggleLike(videoId: String) {
        viewModelScope.launch {
            val current = _uiState.value
            if (current !is FeedUiState.Success) return@launch

            val updatedVideos = current.videos.map { video ->
                if (video.id == videoId) {
                    video.copy(
                        isLiked = !video.isLiked,
                        likeCount = if (video.isLiked) video.likeCount - 1 else video.likeCount + 1,
                    )
                } else video
            }
            _uiState.value = current.copy(videos = updatedVideos)

            val video = current.videos.find { it.id == videoId } ?: return@launch
            if (video.isLiked) {
                feedRepository.unlikeVideo(videoId)
            } else {
                feedRepository.likeVideo(videoId)
            }
        }
    }

    fun markWatched(videoId: String) {
        viewModelScope.launch {
            feedRepository.markWatched(videoId)
        }
    }
}
