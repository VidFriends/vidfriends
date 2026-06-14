package com.vidflow.app.ui.detail

import com.vidflow.app.domain.model.Video

sealed interface VideoDetailUiState {
    data object Loading : VideoDetailUiState
    data class Success(val video: Video) : VideoDetailUiState
    data class Error(val message: String) : VideoDetailUiState
}
