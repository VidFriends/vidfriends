package com.vidfriends.app.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Collection
import com.vidfriends.app.domain.repository.BlockUserRepository
import com.vidfriends.app.domain.repository.CollectionRepository
import com.vidfriends.app.domain.repository.DownloadRepository
import com.vidfriends.app.domain.repository.FeedRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val feedRepository: FeedRepository,
    private val collectionRepository: CollectionRepository,
    private val blockUserRepository: BlockUserRepository,
    val downloadRepository: DownloadRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow<FeedUiState>(FeedUiState.Loading)
    val uiState: StateFlow<FeedUiState> = _uiState.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private var currentPage = 1
    private var hasMore = true
    private val allVideos = mutableListOf<com.vidfriends.app.domain.model.Video>()

    init {
        loadFeed()
    }

    fun loadFeed() {
        viewModelScope.launch {
            val hasExistingContent = _uiState.value is FeedUiState.Success &&
                (_uiState.value as? FeedUiState.Success)?.videos?.isNotEmpty() == true
            if (!hasExistingContent) {
                _uiState.value = FeedUiState.Loading
            }
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
        if (!hasMore || _isLoadingMore.value) return
        viewModelScope.launch {
            _isLoadingMore.value = true
            currentPage++
            try {
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
            } finally {
                _isLoadingMore.value = false
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

    fun blockUser(videoId: String) {
        viewModelScope.launch {
            val video = (uiState.value as? FeedUiState.Success)?.videos?.find { it.id == videoId }
                ?: return@launch
            when (blockUserRepository.blockUser(video.userId)) {
                is ApiResult.Success -> {
                    val current = _uiState.value as? FeedUiState.Success ?: return@launch
                    val filtered = current.videos.filter { it.userId != video.userId }
                    _uiState.value = current.copy(
                        videos = filtered,
                        isRefreshing = current.isRefreshing,
                    )
                }
                is ApiResult.Error -> {}
            }
        }
    }

    private val _collections = MutableStateFlow<List<Collection>>(emptyList())
    val collections: StateFlow<List<Collection>> = _collections.asStateFlow()

    private val _collectionsLoading = MutableStateFlow(false)
    val collectionsLoading: StateFlow<Boolean> = _collectionsLoading.asStateFlow()

    fun loadCollections() {
        viewModelScope.launch {
            _collectionsLoading.value = true
            when (val result = collectionRepository.getCollections()) {
                is ApiResult.Success -> {
                    _collections.value = result.data
                }
                is ApiResult.Error -> {}
            }
            _collectionsLoading.value = false
        }
    }

    fun addVideoToCollection(collectionId: String, videoId: String) {
        viewModelScope.launch {
            collectionRepository.addVideoToCollection(collectionId, videoId)
        }
    }

    fun createAndAddToCollection(name: String, description: String?, videoId: String) {
        viewModelScope.launch {
            when (val result = collectionRepository.createCollection(name, description)) {
                is ApiResult.Success -> {
                    collectionRepository.addVideoToCollection(result.data.id, videoId)
                    loadCollections()
                }
                is ApiResult.Error -> {}
            }
        }
    }
}
