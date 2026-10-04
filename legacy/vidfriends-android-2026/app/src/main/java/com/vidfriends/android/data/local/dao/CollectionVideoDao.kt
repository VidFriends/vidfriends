package com.vidfriends.android.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.vidfriends.android.data.local.entity.CollectionVideoEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CollectionVideoDao {

    @Query("SELECT * FROM collection_videos WHERE collection_id = :collectionId ORDER BY added_at DESC")
    fun getVideosForCollection(collectionId: String): Flow<List<CollectionVideoEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entry: CollectionVideoEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(entries: List<CollectionVideoEntity>)

    @Query("DELETE FROM collection_videos WHERE collection_id = :collectionId AND video_id = :videoId")
    suspend fun delete(collectionId: String, videoId: String)

    @Query("DELETE FROM collection_videos WHERE collection_id = :collectionId")
    suspend fun deleteAllForCollection(collectionId: String)
}
