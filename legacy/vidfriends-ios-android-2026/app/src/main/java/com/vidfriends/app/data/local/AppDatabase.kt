package com.vidfriends.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.vidfriends.app.data.local.dao.CacheDao
import com.vidfriends.app.data.local.dao.CollectionDao
import com.vidfriends.app.data.local.dao.CollectionVideoDao
import com.vidfriends.app.data.local.dao.CommentDao
import com.vidfriends.app.data.local.dao.DownloadDao
import com.vidfriends.app.data.local.dao.HistoryVideoDao
import com.vidfriends.app.data.local.dao.UserDao
import com.vidfriends.app.data.local.dao.VideoDao
import com.vidfriends.app.data.local.entity.CacheEntity
import com.vidfriends.app.data.local.entity.CollectionEntity
import com.vidfriends.app.data.local.entity.CollectionVideoEntity
import com.vidfriends.app.data.local.entity.CommentEntity
import com.vidfriends.app.data.local.entity.DownloadEntity
import com.vidfriends.app.data.local.entity.HistoryVideoEntity
import com.vidfriends.app.data.local.entity.UserEntity
import com.vidfriends.app.data.local.entity.VideoEntity

@Database(
    entities = [
        VideoEntity::class, CommentEntity::class, UserEntity::class, CacheEntity::class,
        CollectionEntity::class, CollectionVideoEntity::class, DownloadEntity::class,
        HistoryVideoEntity::class,
    ],
    version = 5,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun videoDao(): VideoDao
    abstract fun commentDao(): CommentDao
    abstract fun userDao(): UserDao
    abstract fun cacheDao(): CacheDao
    abstract fun collectionDao(): CollectionDao
    abstract fun collectionVideoDao(): CollectionVideoDao
    abstract fun downloadDao(): DownloadDao
    abstract fun historyVideoDao(): HistoryVideoDao

    companion object {
        val MIGRATION_2_3 = Migration(2, 3) { db ->
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS `collections` (
                    `id` TEXT PRIMARY KEY NOT NULL,
                    `name` TEXT NOT NULL,
                    `description` TEXT,
                    `video_count` INTEGER NOT NULL DEFAULT 0,
                    `created_at` TEXT NOT NULL
                )
            """.trimIndent())
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS `collection_videos` (
                    `collection_id` TEXT NOT NULL,
                    `video_id` TEXT NOT NULL,
                    `added_at` TEXT NOT NULL,
                    PRIMARY KEY(`collection_id`, `video_id`)
                )
            """.trimIndent())
        }

        val MIGRATION_4_5 = Migration(4, 5) { db ->
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS `history_videos` (
                    `id` TEXT PRIMARY KEY NOT NULL,
                    `user_id` TEXT NOT NULL,
                    `username` TEXT NOT NULL,
                    `source_url` TEXT,
                    `file_path` TEXT NOT NULL,
                    `thumbnail_path` TEXT,
                    `caption` TEXT,
                    `duration` INTEGER NOT NULL,
                    `file_size` INTEGER NOT NULL,
                    `mime_type` TEXT NOT NULL,
                    `is_liked` INTEGER NOT NULL DEFAULT 0,
                    `like_count` INTEGER NOT NULL DEFAULT 0,
                    `comment_count` INTEGER NOT NULL DEFAULT 0,
                    `created_at` TEXT NOT NULL,
                    `is_duplicate` INTEGER NOT NULL DEFAULT 0,
                    `duplicate_of` TEXT
                )
            """.trimIndent())
        }

        val MIGRATION_3_4 = Migration(3, 4) { db ->
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS `downloads` (
                    `id` TEXT PRIMARY KEY NOT NULL,
                    `video_id` TEXT NOT NULL,
                    `local_path` TEXT,
                    `status` TEXT NOT NULL,
                    `progress` INTEGER NOT NULL DEFAULT 0,
                    `downloaded_at` INTEGER,
                    `file_size` INTEGER NOT NULL DEFAULT 0,
                    `mime_type` TEXT NOT NULL
                )
            """.trimIndent())
        }
    }
}
