package com.vidflow.app.data.local.dao

import androidx.room.*
import com.vidflow.app.data.local.entity.CacheEntity

@Dao
interface CacheDao {

    @Query("SELECT * FROM cache WHERE `key` = :key AND expires_at > :now")
    suspend fun get(key: String, now: Long = System.currentTimeMillis()): CacheEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(cache: CacheEntity)

    @Query("DELETE FROM cache WHERE `key` = :key")
    suspend fun evict(key: String)

    @Query("DELETE FROM cache WHERE expires_at <= :now")
    suspend fun evictExpired(now: Long = System.currentTimeMillis())
}
