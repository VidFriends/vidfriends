package com.vidflow.app.ui.detail

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.vidflow.app.domain.model.ApiResult
import com.vidflow.app.domain.model.Comment
import com.vidflow.app.domain.repository.FeedRepository
import com.vidflow.app.domain.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VideoDetailUiState(
    val video: com.vidflow.app.domain.model.Video? = null,
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

    private val _controlsVisible = MutableStateFlow(true)
    val controlsVisible: StateFlow<Boolean> = _controlsVisible.asStateFlow()

    private val _isPlaying = MutableStateFlow(true)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _volume = MutableStateFlow(1f)
    val volume: StateFlow<Float> = _volume.asStateFlow()

    private var _player: ExoPlayer? = null
    val player: ExoPlayer? get() = _player

    private var controlsHideJob: Job? = null

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
                    if (url.isNotBlank()) initPlayer(url)
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
                addListener(
                    object : Player.Listener {
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            _isPlaying.value = isPlaying
                        }
                    },
                )
            }
    }

    fun togglePlayPause() {
        val p = _player ?: return
        if (p.isPlaying) p.pause() else p.play()
        _isPlaying.value = p.isPlaying
    }

    fun seekTo(positionMs: Long) {
        _player?.seekTo(positionMs)
    }

    fun setVolume(vol: Float) {
        _player?.volume = vol
        _volume.value = vol
    }

    fun showControls() {
        _controlsVisible.value = true
        controlsHideJob?.cancel()
        controlsHideJob = viewModelScope.launch {
            delay(3000)
            _controlsVisible.value = false
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
