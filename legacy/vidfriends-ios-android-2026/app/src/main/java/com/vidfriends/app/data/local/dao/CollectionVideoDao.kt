package com.vidfriends.app.data.local.dao

import androidx.room.*
import com.vidfriends.app.data.local.entity.CollectionVideoEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CollectionVideoDao {

    @Query("SELECT * FROM collection_videos WHERE collection_id = :collectionId ORDER BY added_at DESC")
    fun getVideosForCollection(collectionId: String): Flow<List<CollectionVideoEntity>>

    @Query("SELECT * FROM collection_videos WHERE collection_id = :collectionId AND video_id = :videoId")
    suspend fun getVideo(collectionId: String, videoId: String): CollectionVideoEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(video: CollectionVideoEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(videos: List<CollectionVideoEntity>)

    @Delete
    suspend fun delete(video: CollectionVideoEntity)

    @Query("DELETE FROM collection_videos WHERE collection_id = :collectionId AND video_id = :videoId")
    suspend fun deleteVideoFromCollection(collectionId: String, videoId: String)

    @Query("DELETE FROM collection_videos WHERE collection_id = :collectionId")
    suspend fun deleteAllForCollection(collectionId: String)

    @Query("DELETE FROM collection_videos")
    suspend fun deleteAll()
}
