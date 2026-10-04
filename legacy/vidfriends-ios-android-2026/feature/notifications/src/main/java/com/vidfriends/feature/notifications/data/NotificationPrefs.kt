package com.vidfriends.feature.notifications.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import com.vidfriends.feature.notifications.domain.NotificationChannelType
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.notificationPrefs: DataStore<Preferences> by preferencesDataStore(
    name = "notification_preferences",
)

@Singleton
class NotificationPrefs @Inject constructor(
    private val context: Context,
) {
    private fun channelEnabledKey(channelId: String) = booleanPreferencesKey("channel_$channelId")

    fun isChannelEnabled(channel: NotificationChannelType): Flow<Boolean> {
        return context.notificationPrefs.data.map { prefs ->
            prefs[channelEnabledKey(channel.channelId)] ?: true
        }
    }

    suspend fun setChannelEnabled(channel: NotificationChannelType, enabled: Boolean) {
        context.notificationPrefs.edit { prefs ->
            prefs[channelEnabledKey(channel.channelId)] = enabled
        }
    }
}
