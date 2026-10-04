package com.vidfriends.app.ui.collections

import com.vidfriends.app.domain.model.ApiResult
import com.vidfriends.app.domain.model.Collection
import com.vidfriends.app.domain.model.Video
import com.vidfriends.app.domain.repository.CollectionRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CollectionsViewModelTest {

    private val collectionRepository = FakeCollectionRepository()
    private lateinit var viewModel: CollectionsViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun teardown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loadCollections shows collections on init`() = runTest {
        collectionRepository.setCollections(
            listOf(
                Collection(id = "c1", name = "Favorites", description = null, videoCount = 3, createdAt = ""),
            ),
        )

        viewModel = CollectionsViewModel(
            collectionRepository = collectionRepository,
        )

        val state = viewModel.uiState.value
        assert(!state.isLoading)
        assert(state.error == null)
        assert(state.collections.size == 1)
        assert(state.collections[0].name == "Favorites")
    }

    @Test
    fun `loadCollections shows error when repository fails`() = runTest {
        collectionRepository.setError("Failed to load collections")

        viewModel = CollectionsViewModel(
            collectionRepository = collectionRepository,
        )

        val state = viewModel.uiState.value
        assert(!state.isLoading)
        assert(state.error == "Failed to load collections")
    }

    @Test
    fun `refresh reloads collections and clears error`() = runTest {
        collectionRepository.setCollections(
            listOf(
                Collection(id = "c1", name = "Favorites", description = null, videoCount = 3, createdAt = ""),
            ),
        )

        viewModel = CollectionsViewModel(
            collectionRepository = collectionRepository,
        )

        collectionRepository.setCollections(
            listOf(
                Collection(id = "c2", name = "Watch Later", description = null, videoCount = 1, createdAt = ""),
            ),
        )
        viewModel.refresh()

        val state = viewModel.uiState.value
        assert(!state.isRefreshing)
        assert(state.error == null)
        assert(state.collections[0].name == "Watch Later")
    }

    @Test
    fun `createCollection adds new collection and reloads`() = runTest {
        collectionRepository.setCollections(emptyList())

        viewModel = CollectionsViewModel(
            collectionRepository = collectionRepository,
        )

        viewModel.createCollection("New Collection", null)

        val state = viewModel.uiState.value
        assert(state.collections.any { it.name == "New Collection" })
    }

    @Test
    fun `createCollection shows error when creation fails`() = runTest {
        collectionRepository.setError("Creation failed")
        collectionRepository.setCreateError(true)

        viewModel = CollectionsViewModel(
            collectionRepository = collectionRepository,
        )

        viewModel.createCollection("New Collection", null)

        assert(viewModel.uiState.value.error == "Creation failed")
    }

    @Test
    fun `deleteCollection removes collection from list`() = runTest {
        collectionRepository.setCollections(
            listOf(
                Collection(id = "c1", name = "Favorites", description = null, videoCount = 3, createdAt = ""),
                Collection(id = "c2", name = "Watch Later", description = null, videoCount = 1, createdAt = ""),
            ),
        )

        viewModel = CollectionsViewModel(
            collectionRepository = collectionRepository,
        )

        viewModel.deleteCollection("c1")

        val state = viewModel.uiState.value
        assert(state.collections.size == 1)
        assert(state.collections[0].id == "c2")
    }

    @Test
    fun `showCreateDialog sets showCreateDialog to true`() = runTest {
        viewModel = CollectionsViewModel(
            collectionRepository = collectionRepository,
        )

        viewModel.showCreateDialog()

        assert(viewModel.uiState.value.showCreateDialog)
    }

    @Test
    fun `hideCreateDialog sets showCreateDialog to false`() = runTest {
        viewModel = CollectionsViewModel(
            collectionRepository = collectionRepository,
        )

        viewModel.showCreateDialog()
        viewModel.hideCreateDialog()

        assert(!viewModel.uiState.value.showCreateDialog)
    }

    private class FakeCollectionRepository : CollectionRepository {
        private var error: String? = null
        private var createError = false
        private var collections = mutableListOf<Collection>()

        fun setCollections(list: List<Collection>) {
            collections = list.toMutableList()
            error = null
        }

        fun setError(message: String) {
            error = message
        }

        fun setCreateError(value: Boolean) {
            createError = value
        }

        override suspend fun getCollections(): ApiResult<List<Collection>> {
            return error?.let { ApiResult.Error(it) }
                ?: ApiResult.Success(collections.toList())
        }

        override suspend fun createCollection(name: String, description: String?): ApiResult<Collection> {
            if (createError) {
                return ApiResult.Error(error ?: "Creation failed")
            }
            val c = Collection(
                id = "c_${name.hashCode()}",
                name = name,
                description = description,
                videoCount = 0,
                createdAt = "",
            )
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
}
