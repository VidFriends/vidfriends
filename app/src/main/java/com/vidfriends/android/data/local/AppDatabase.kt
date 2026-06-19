package com.vidfriends.android.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.vidfriends.android.data.local.dao.CacheDao
import com.vidfriends.android.data.local.dao.CollectionDao
import com.vidfriends.android.data.local.dao.CollectionVideoDao
import com.vidfriends.android.data.local.dao.CommentDao
import com.vidfriends.android.data.local.dao.DownloadDao
import com.vidfriends.android.data.local.dao.VideoDao
import com.vidfriends.android.data.local.entity.CacheEntity
import com.vidfriends.android.data.local.entity.CollectionEntity
import com.vidfriends.android.data.local.entity.CollectionVideoEntity
import com.vidfriends.android.data.local.entity.CommentEntity
import com.vidfriends.android.data.local.entity.DownloadEntity
import com.vidfriends.android.data.local.entity.VideoEntity

@Database(
    entities = [
        VideoEntity::class,
        CommentEntity::class,
        CacheEntity::class,
        CollectionEntity::class,
        CollectionVideoEntity::class,
        DownloadEntity::class,
    ],
    version = 4,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun videoDao(): VideoDao
    abstract fun commentDao(): CommentDao
    abstract fun cacheDao(): CacheDao
    abstract fun collectionDao(): CollectionDao
    abstract fun collectionVideoDao(): CollectionVideoDao
    abstract fun downloadDao(): DownloadDao


}
