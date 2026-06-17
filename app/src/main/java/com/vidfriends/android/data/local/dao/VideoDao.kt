package com.vidfriends.android.data.local.dao

import androidx.room.*
import com.vidfriends.android.data.local.entity.VideoEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface VideoDao {

    @Query("SELECT * FROM videos ORDER BY created_at DESC")
    fun getAllVideos(): Flow<List<VideoEntity>>

    @Query("SELECT * FROM videos WHERE id = :id")
    suspend fun getVideoById(id: String): VideoEntity?

    @Query("SELECT * FROM videos WHERE id = :id")
    fun getVideoByIdFlow(id: String): Flow<VideoEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(videos: List<VideoEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(video: VideoEntity)

    @Query("UPDATE videos SET is_liked = :isLiked, like_count = :likeCount WHERE id = :videoId")
    suspend fun updateLikeStatus(videoId: String, isLiked: Boolean, likeCount: Int)

    @Query("DELETE FROM videos WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM videos")
    suspend fun deleteAll()

    @Query("SELECT COUNT(*) FROM videos")
    suspend fun count(): Int
}
