package com.vidflow.app.ui.feed

import com.vidflow.app.domain.model.Video

sealed interface FeedUiState {
    data object Loading : FeedUiState
    data class Success(
        val videos: List<Video>,
        val isRefreshing: Boolean = false,
    ) : FeedUiState
    data class Error(val message: String) : FeedUiState
    data object AllCaughtUp : FeedUiState
    data object Empty : FeedUiState
}
