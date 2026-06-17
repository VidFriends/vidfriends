package com.vidfriends.app.data.local.dao

import androidx.room.*
import com.vidfriends.app.data.local.entity.DownloadEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {

    @Query("SELECT * FROM downloads ORDER BY downloaded_at DESC")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE video_id = :videoId")
    fun getDownloadByVideoId(videoId: String): Flow<DownloadEntity?>

    @Query("SELECT * FROM downloads WHERE id = :id")
    suspend fun getDownloadById(id: String): DownloadEntity?

    @Query("SELECT * FROM downloads WHERE video_id = :videoId")
    suspend fun getDownloadByVideoIdSync(videoId: String): DownloadEntity?

    @Query("SELECT * FROM downloads ORDER BY downloaded_at DESC")
    suspend fun getAllDownloadsSync(): List<DownloadEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(download: DownloadEntity)

    @Query("UPDATE downloads SET status = :status, progress = :progress, local_path = :localPath WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, progress: Int, localPath: String?)

    @Query("UPDATE downloads SET progress = :progress WHERE id = :id")
    suspend fun updateProgress(id: String, progress: Int)

    @Query("DELETE FROM downloads WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM downloads")
    suspend fun deleteAll()

    @Query("SELECT COUNT(*) FROM downloads WHERE status = 'COMPLETED'")
    suspend fun countCompleted(): Int

    @Query("SELECT SUM(file_size) FROM downloads WHERE status = 'COMPLETED'")
    suspend fun totalCompletedSize(): Long?
}
