package com.vidfriends.app.ui.feed

import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.BlockedUser
import com.vidfriends.app.domain.model.Collection
import com.vidfriends.app.domain.model.Download
import com.vidfriends.app.domain.model.DownloadStatus
import com.vidfriends.app.domain.model.StorageInfo
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.domain.repository.BlockUserRepository
import com.vidfriends.app.domain.repository.CollectionRepository
import com.vidfriends.app.domain.repository.DownloadRepository
import com.vidfriends.app.domain.repository.FeedRepository
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FeedViewModelTest {

    private val feedRepository = FakeFeedRepository()
    private val collectionRepository = FakeCollectionRepository()
    private val blockUserRepository = FakeBlockUserRepository()
    private val downloadRepository = FakeDownloadRepository()
    private lateinit var viewModel: FeedViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loadFeed shows Success with videos on init`() = runTest {
        feedRepository.setVideos(listOf(testVideo))

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        val state = viewModel.uiState.value
        assert(state is FeedUiState.Success)
        assert((state as FeedUiState.Success).videos.size == 1)
        assert((state).videos[0].id == "v1")
    }

    @Test
    fun `loadFeed shows Empty when no videos returned`() = runTest {
        feedRepository.setVideos(emptyList())

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        assert(viewModel.uiState.value is FeedUiState.Empty)
    }

    @Test
    fun `loadFeed shows Error when repository fails`() = runTest {
        feedRepository.setError("Network failure")

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        val state = viewModel.uiState.value
        assert(state is FeedUiState.Error)
        assert((state as FeedUiState.Error).message == "Network failure")
    }

    @Test
    fun `refresh reloads videos and clears isRefreshing`() = runTest {
        feedRepository.setVideos(listOf(testVideo))

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        feedRepository.setVideos(listOf(testVideo.copy(id = "v2", caption = "Refreshed")))
        viewModel.refresh()

        val state = viewModel.uiState.value as FeedUiState.Success
        assert(state.videos[0].id == "v2")
        assert(!state.isRefreshing)
    }

    @Test
    fun `refresh shows Error when refresh fails`() = runTest {
        feedRepository.setVideos(listOf(testVideo))

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        feedRepository.setError("Refresh failed")
        viewModel.refresh()

        assert(viewModel.uiState.value is FeedUiState.Error)
        assert((viewModel.uiState.value as FeedUiState.Error).message == "Refresh failed")
    }

    @Test
    fun `loadNextPage appends more videos`() = runTest {
        feedRepository.setVideos(
            List(10) { testVideo.copy(id = "v$it") },
        )

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        feedRepository.setVideos(
            List(5) { testVideo.copy(id = "page2_$it") },
        )
        viewModel.loadNextPage()

        val state = viewModel.uiState.value as FeedUiState.Success
        assert(state.videos.size == 15)
        assert(state.videos[0].id == "v0")
        assert(state.videos[10].id == "page2_0")
    }

    @Test
    fun `loadNextPage guards against concurrent calls`() = runTest {
        val blocker = CompletableDeferred<Unit>()
        feedRepository.setVideos(List(10) { testVideo.copy(id = "v$it") })
        feedRepository.setBlocking(blocker)

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        val initial = viewModel.uiState.value as FeedUiState.Success
        assert(initial.videos.size == 10)

        feedRepository.setBlocking(null)
        feedRepository.setVideos(List(5) { testVideo.copy(id = "page2_$it") })

        val loadBlocker = CompletableDeferred<Unit>()
        feedRepository.setBlocking(loadBlocker)

        viewModel.loadNextPage()
        assert(viewModel.isLoadingMore.value)

        feedRepository.setVideos(List(100) { testVideo.copy(id = "surplus_$it") })

        viewModel.loadNextPage()

        loadBlocker.complete(Unit)

        val state = viewModel.uiState.value as FeedUiState.Success
        assert(state.videos.size == 15)
    }

    @Test
    fun `toggleLike optimistically updates like state and count`() = runTest {
        feedRepository.setVideos(listOf(testVideo))

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        viewModel.toggleLike("v1")

        val state = viewModel.uiState.value as FeedUiState.Success
        assert(state.videos[0].isLiked)
        assert(state.videos[0].likeCount == 6)
    }

    @Test
    fun `toggleLike toggles back when called twice`() = runTest {
        feedRepository.setVideos(listOf(testVideo))

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        viewModel.toggleLike("v1")
        viewModel.toggleLike("v1")

        val state = viewModel.uiState.value as FeedUiState.Success
        assert(!state.videos[0].isLiked)
        assert(state.videos[0].likeCount == 5)
    }

    @Test
    fun `blockUser removes videos from same user from feed`() = runTest {
        val video1 = testVideo.copy(id = "v1", userId = "u1")
        val video2 = testVideo.copy(id = "v2", userId = "u2", caption = "Keep me")
        val video3 = testVideo.copy(id = "v3", userId = "u1", caption = "Also blocked")
        feedRepository.setVideos(listOf(video1, video2, video3))

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        viewModel.blockUser("v1")

        val state = viewModel.uiState.value as FeedUiState.Success
        assert(state.videos.size == 1)
        assert(state.videos[0].id == "v2")
    }

    @Test
    fun `blockUser does nothing when block fails`() = runTest {
        feedRepository.setVideos(listOf(testVideo))
        blockUserRepository.setBlockError("Block failed")

        viewModel = FeedViewModel(
            feedRepository = feedRepository,
            collectionRepository = collectionRepository,
            blockUserRepository = blockUserRepository,
            downloadRepository = downloadRepository,
        )

        viewModel.blockUser("v1")

        val state = viewModel.uiState.value as FeedUiState.Success
        assert(state.videos.size == 1)
        assert(state.videos[0].id == "v1")
    }

    companion object {
        val testVideo = Video(
            id = "v1",
            userId = "u1",
            username = "testuser",
            sourceUrl = null,
            filePath = "/videos/test.mp4",
            thumbnailPath = null,
            caption = "Test video",
            duration = 30000,
            fileSize = 1024000,
            mimeType = "video/mp4",
            isLiked = false,
            likeCount = 5,
            commentCount = 2,
            createdAt = "2026-06-14T00:00:00Z",
        )
    }

    private class FakeFeedRepository : FeedRepository {
        private var response: ApiResult<List<Video>> = ApiResult.Success(emptyList())
        private var blocker: CompletableDeferred<Unit>? = null

        fun setVideos(videos: List<Video>) {
            response = ApiResult.Success(videos)
        }

        fun setError(message: String) {
            response = ApiResult.Error(message)
        }

        fun setBlocking(deferred: CompletableDeferred<Unit>?) {
            blocker = deferred
        }

        override suspend fun getFeed(page: Int, limit: Int): ApiResult<List<Video>> {
            blocker?.await()
            return response
        }

        override suspend fun likeVideo(videoId: String): ApiResult<Unit> = ApiResult.Success(Unit)

        override suspend fun unlikeVideo(videoId: String): ApiResult<Unit> = ApiResult.Success(Unit)

        override suspend fun markWatched(videoId: String): ApiResult<Unit> = ApiResult.Success(Unit)
    }

    private class FakeCollectionRepository : CollectionRepository {
        private val collections = mutableListOf<Collection>()

        override suspend fun getCollections(): ApiResult<List<Collection>> =
            ApiResult.Success(collections.toList())

        override suspend fun createCollection(name: String, description: String?): ApiResult<Collection> {
            val c = Collection(id = "c1", name = name, description = description, videoCount = 0, createdAt = "")
            collections.add(c)
            return ApiResult.Success(c)
        }

        override suspend fun updateCollection(id: String, name: String?, description: String?): ApiResult<Collection> =
            ApiResult.Error("not implemented")

        override suspend fun deleteCollection(id: String): ApiResult<Unit> {
            collections.removeAll { it.id == id }
            return ApiResult.Success(Unit)
        }

        override suspend fun addVideoToCollection(collectionId: String, videoId: String): ApiResult<Unit> =
            ApiResult.Success(Unit)

        override suspend fun removeVideoFromCollection(collectionId: String, videoId: String): ApiResult<Unit> =
            ApiResult.Success(Unit)

        override suspend fun getCollectionVideos(collectionId: String): ApiResult<List<Video>> =
            ApiResult.Success(emptyList())
    }

    private class FakeBlockUserRepository : BlockUserRepository {
        private var blockError: String? = null

        fun setBlockError(message: String) {
            blockError = message
        }

        override suspend fun blockUser(userId: String): ApiResult<Unit> {
            return blockError?.let { ApiResult.Error(it) } ?: ApiResult.Success(Unit)
        }

        override suspend fun unblockUser(userId: String): ApiResult<Unit> = ApiResult.Success(Unit)

        override suspend fun getBlockedUsers(page: Int, limit: Int): ApiResult<List<BlockedUser>> =
            ApiResult.Success(emptyList())
    }

    private class FakeDownloadRepository : DownloadRepository {
        private val _downloads = MutableStateFlow<List<Download>>(emptyList())

        override fun getDownloads(): Flow<List<Download>> = _downloads

        override fun getDownloadForVideo(videoId: String): Flow<Download?> = flowOf(null)

        override suspend fun startDownload(videoId: String) {}

        override suspend fun pauseDownload(videoId: String) {}

        override suspend fun resumeDownload(videoId: String) {}

        override suspend fun cancelDownload(videoId: String) {}

        override suspend fun deleteDownload(videoId: String) {}

        override suspend fun deleteAllDownloads() {}

        override suspend fun getStorageInfo(): StorageInfo = StorageInfo(availableBytes = 1000, usedBytes = 100, totalBytes = 1100)

        override suspend fun isVideoDownloaded(videoId: String): Boolean = false
    }
}
