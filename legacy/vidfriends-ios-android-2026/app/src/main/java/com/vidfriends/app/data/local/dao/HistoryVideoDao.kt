package com.vidfriends.app.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.vidfriends.app.data.local.entity.HistoryVideoEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HistoryVideoDao {

    @Query("SELECT * FROM history_videos ORDER BY created_at DESC")
    fun getAllHistoryVideos(): Flow<List<HistoryVideoEntity>>

    @Query("SELECT * FROM history_videos ORDER BY created_at DESC")
    suspend fun getAllHistoryVideosSync(): List<HistoryVideoEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(videos: List<HistoryVideoEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(video: HistoryVideoEntity)

    @Query("DELETE FROM history_videos WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM history_videos")
    suspend fun deleteAll()
}
