package com.vidflow.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.vidflow.app.data.local.dao.CacheDao
import com.vidflow.app.data.local.dao.CommentDao
import com.vidflow.app.data.local.dao.UserDao
import com.vidflow.app.data.local.dao.VideoDao
import com.vidflow.app.data.local.entity.CacheEntity
import com.vidflow.app.data.local.entity.CommentEntity
import com.vidflow.app.data.local.entity.UserEntity
import com.vidflow.app.data.local.entity.VideoEntity

@Database(
    entities = [VideoEntity::class, CommentEntity::class, UserEntity::class, CacheEntity::class],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun videoDao(): VideoDao
    abstract fun commentDao(): CommentDao
    abstract fun userDao(): UserDao
    abstract fun cacheDao(): CacheDao
}
