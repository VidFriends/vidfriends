package com.vidfriends.app.di

import com.vidfriends.app.data.repository.AuthRepositoryImpl
import com.vidfriends.app.data.repository.BlockUserRepositoryImpl
import com.vidfriends.app.data.repository.CollectionRepositoryImpl
import com.vidfriends.app.data.repository.DownloadRepositoryImpl
import com.vidfriends.app.data.repository.FeedRepositoryImpl
import com.vidfriends.app.data.repository.HistoryRepositoryImpl
import com.vidfriends.app.data.repository.SetupRepositoryImpl
import com.vidfriends.app.data.repository.VideoRepositoryImpl
import com.vidfriends.app.domain.repository.AuthRepository
import com.vidfriends.app.domain.repository.BlockUserRepository
import com.vidfriends.app.domain.repository.CollectionRepository
import com.vidfriends.app.domain.repository.DownloadRepository
import com.vidfriends.app.domain.repository.FeedRepository
import com.vidfriends.app.domain.repository.HistoryRepository
import com.vidfriends.app.domain.repository.SetupRepository
import com.vidfriends.app.domain.repository.VideoRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds
    @Singleton
    abstract fun bindBlockUserRepository(impl: BlockUserRepositoryImpl): BlockUserRepository

    @Binds
    @Singleton
    abstract fun bindCollectionRepository(impl: CollectionRepositoryImpl): CollectionRepository

    @Binds
    @Singleton
    abstract fun bindDownloadRepository(impl: DownloadRepositoryImpl): DownloadRepository

    @Binds
    @Singleton
    abstract fun bindFeedRepository(impl: FeedRepositoryImpl): FeedRepository

    @Binds
    @Singleton
    abstract fun bindVideoRepository(impl: VideoRepositoryImpl): VideoRepository

    @Binds
    @Singleton
    abstract fun bindHistoryRepository(impl: HistoryRepositoryImpl): HistoryRepository

    @Binds
    @Singleton
    abstract fun bindSetupRepository(impl: SetupRepositoryImpl): SetupRepository
}
