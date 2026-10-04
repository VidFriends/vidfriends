package com.vidfriends.android.ui.detail

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import com.vidfriends.android.domain.model.ApiResult
import com.vidfriends.android.domain.model.Comment
import com.vidfriends.android.domain.model.Video
import com.vidfriends.android.domain.repository.FeedRepository
import com.vidfriends.android.domain.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VideoDetailUiState(
    val video: Video? = null,
    val comments: List<Comment> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val isLiked: Boolean = false,
    val likeCount: Int = 0,
    val commentText: String = "",
    val isSubmittingComment: Boolean = false,
)

@HiltViewModel
class VideoDetailViewModel @Inject constructor(
    private val videoRepository: VideoRepository,
    private val feedRepository: FeedRepository,
    private val application: Application,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VideoDetailUiState())
    val uiState: StateFlow<VideoDetailUiState> = _uiState.asStateFlow()

    private var _player: ExoPlayer? = null
    val player: ExoPlayer? get() = _player

    fun loadVideo(videoId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            when (val result = videoRepository.getVideo(videoId)) {
                is ApiResult.Success -> {
                    val video = result.data
                    _uiState.value = _uiState.value.copy(
                        video = video,
                        isLoading = false,
                        isLiked = video.isLiked,
                        likeCount = video.likeCount,
                    )
                    val url = video.filePath.ifBlank { video.sourceUrl ?: "" }
                    if (url.isNotBlank()) {
                        try {
                            initPlayer(url)
                        } catch (_: Exception) {
                        }
                    }
                    loadComments(videoId)
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

    fun markWatched(videoId: String) {
        viewModelScope.launch {
            feedRepository.markWatched(videoId)
        }
    }

    private fun loadComments(videoId: String) {
        viewModelScope.launch {
            when (val result = videoRepository.getComments(videoId)) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(comments = result.data)
                }
                is ApiResult.Error -> {}
            }
        }
    }

    private fun initPlayer(url: String) {
        _player = ExoPlayer.Builder(application)
            .build()
            .apply {
                setMediaItem(MediaItem.fromUri(url))
                prepare()
                playWhenReady = true
            }
    }

    fun toggleLike() {
        val current = _uiState.value
        val video = current.video ?: return
        val newLiked = !current.isLiked
        val newCount = if (newLiked) current.likeCount + 1 else current.likeCount - 1
        _uiState.value = current.copy(isLiked = newLiked, likeCount = newCount)

        viewModelScope.launch {
            if (newLiked) feedRepository.likeVideo(video.id)
            else feedRepository.unlikeVideo(video.id)
        }
    }

    fun onCommentTextChanged(text: String) {
        _uiState.value = _uiState.value.copy(commentText = text)
    }

    fun submitComment() {
        val text = _uiState.value.commentText.trim()
        if (text.isEmpty()) return
        val video = _uiState.value.video ?: return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSubmittingComment = true)
            when (val result = videoRepository.addComment(video.id, text)) {
                is ApiResult.Success -> {
                    val newComments = _uiState.value.comments + result.data
                    _uiState.value = _uiState.value.copy(
                        comments = newComments,
                        commentText = "",
                        isSubmittingComment = false,
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(isSubmittingComment = false)
                }
            }
        }
    }

    fun deleteComment(commentId: String) {
        val video = _uiState.value.video ?: return
        viewModelScope.launch {
            videoRepository.deleteComment(video.id, commentId)
            val updated = _uiState.value.comments.filter { it.id != commentId }
            _uiState.value = _uiState.value.copy(comments = updated)
        }
    }

    override fun onCleared() {
        super.onCleared()
        _player?.release()
        _player = null
    }
}
