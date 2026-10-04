package com.vidfriends.android.data.local

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

val MIGRATION_1_2: Migration = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `videos` (
                `id` TEXT NOT NULL,
                `user_id` TEXT NOT NULL,
                `username` TEXT NOT NULL,
                `source_url` TEXT,
                `file_path` TEXT NOT NULL,
                `thumbnail_path` TEXT,
                `caption` TEXT,
                `duration` INTEGER NOT NULL,
                `file_size` INTEGER NOT NULL,
                `mime_type` TEXT NOT NULL,
                `is_liked` INTEGER NOT NULL,
                `like_count` INTEGER NOT NULL,
                `comment_count` INTEGER NOT NULL,
                `created_at` TEXT NOT NULL,
                PRIMARY KEY(`id`)
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `comments` (
                `id` TEXT NOT NULL,
                `video_id` TEXT NOT NULL,
                `user_id` TEXT NOT NULL,
                `username` TEXT NOT NULL,
                `text` TEXT NOT NULL,
                `created_at` TEXT NOT NULL,
                PRIMARY KEY(`id`)
            )
            """.trimIndent()
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS `index_comments_video_id` ON `comments` (`video_id`)"
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `cache` (
                `key` TEXT NOT NULL,
                `value` TEXT NOT NULL,
                `expires_at` INTEGER NOT NULL,
                PRIMARY KEY(`key`)
            )
            """.trimIndent()
        )
    }
}

val MIGRATION_2_3: Migration = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `collections` (
                `id` TEXT NOT NULL,
                `name` TEXT NOT NULL,
                `description` TEXT,
                `video_count` INTEGER NOT NULL DEFAULT 0,
                `created_at` TEXT NOT NULL,
                PRIMARY KEY(`id`)
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `collection_videos` (
                `collection_id` TEXT NOT NULL,
                `video_id` TEXT NOT NULL,
                `added_at` TEXT NOT NULL,
                PRIMARY KEY(`collection_id`, `video_id`)
            )
            """.trimIndent()
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS `index_collection_videos_video_id` ON `collection_videos` (`video_id`)"
        )
    }
}

val MIGRATION_3_4: Migration = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `downloads` (
                `id` TEXT NOT NULL,
                `video_id` TEXT NOT NULL,
                `file_path` TEXT,
                `status` TEXT NOT NULL,
                `progress` INTEGER NOT NULL DEFAULT 0,
                `created_at` TEXT NOT NULL,
                PRIMARY KEY(`id`)
            )
            """.trimIndent()
        )
    }
}
