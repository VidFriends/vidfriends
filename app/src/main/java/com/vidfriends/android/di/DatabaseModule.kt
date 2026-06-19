package com.vidfriends.android.di

import android.content.Context
import androidx.room.Room
import com.vidfriends.android.data.local.AppDatabase
import com.vidfriends.android.data.local.MIGRATION_1_2
import com.vidfriends.android.data.local.MIGRATION_2_3
import com.vidfriends.android.data.local.MIGRATION_3_4
import com.vidfriends.android.data.local.dao.CacheDao
import com.vidfriends.android.data.local.dao.CollectionDao
import com.vidfriends.android.data.local.dao.CollectionVideoDao
import com.vidfriends.android.data.local.dao.CommentDao
import com.vidfriends.android.data.local.dao.DownloadDao
import com.vidfriends.android.data.local.dao.VideoDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "vidfriends.db",
        ).addMigrations(
                MIGRATION_1_2,
                MIGRATION_2_3,
                MIGRATION_3_4,
            ).build()

    @Provides
    @Singleton
    fun provideVideoDao(db: AppDatabase): VideoDao = db.videoDao()

    @Provides
    @Singleton
    fun provideCommentDao(db: AppDatabase): CommentDao = db.commentDao()

    @Provides
    @Singleton
    fun provideCacheDao(db: AppDatabase): CacheDao = db.cacheDao()

    @Provides
    @Singleton
    fun provideCollectionDao(db: AppDatabase): CollectionDao = db.collectionDao()

    @Provides
    @Singleton
    fun provideCollectionVideoDao(db: AppDatabase): CollectionVideoDao = db.collectionVideoDao()

    @Provides
    @Singleton
    fun provideDownloadDao(db: AppDatabase): DownloadDao = db.downloadDao()
}
