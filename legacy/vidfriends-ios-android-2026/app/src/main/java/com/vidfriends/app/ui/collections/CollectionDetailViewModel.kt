package com.vidfriends.app.ui.collections

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Collection
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.domain.repository.CollectionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CollectionDetailUiState(
    val collection: Collection? = null,
    val videos: List<Video> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class CollectionDetailViewModel @Inject constructor(
    private val collectionRepository: CollectionRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CollectionDetailUiState())
    val uiState: StateFlow<CollectionDetailUiState> = _uiState.asStateFlow()

    fun loadCollection(collectionId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            val collectionsResult = collectionRepository.getCollections()
            if (collectionsResult is ApiResult.Success) {
                val collection = collectionsResult.data.find { it.id == collectionId }
                _uiState.value = _uiState.value.copy(collection = collection)
            }

            when (val result = collectionRepository.getCollectionVideos(collectionId)) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        videos = result.data,
                        isLoading = false,
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        error = result.message,
                        isLoading = false,
                    )
                }
            }
        }
    }

    fun refresh(collectionId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)

            when (val result = collectionRepository.getCollectionVideos(collectionId)) {
                is ApiResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        videos = result.data,
                        isRefreshing = false,
                    )
                }
                is ApiResult.Error -> {
                    _uiState.value = _uiState.value.copy(isRefreshing = false)
                }
            }

            val collectionsResult = collectionRepository.getCollections()
            if (collectionsResult is ApiResult.Success) {
                val collection = collectionsResult.data.find { it.id == collectionId }
                _uiState.value = _uiState.value.copy(collection = collection)
            }
        }
    }

    fun removeVideo(collectionId: String, videoId: String) {
        viewModelScope.launch {
            collectionRepository.removeVideoFromCollection(collectionId, videoId)
            _uiState.value = _uiState.value.copy(
                videos = _uiState.value.videos.filter { it.id != videoId },
            )
        }
    }
}
