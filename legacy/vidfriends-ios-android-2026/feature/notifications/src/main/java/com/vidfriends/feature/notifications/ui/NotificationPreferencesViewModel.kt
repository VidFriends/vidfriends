package com.vidfriends.feature.notifications.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vidfriends.feature.notifications.data.NotificationPrefs
import com.vidfriends.feature.notifications.domain.NotificationChannelType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChannelToggleState(
    val channel: NotificationChannelType,
    val enabled: Boolean,
)

@HiltViewModel
class NotificationPreferencesViewModel @Inject constructor(
    private val notificationPrefs: NotificationPrefs,
) : ViewModel() {

    val channels: StateFlow<Map<NotificationChannelType, Boolean>> = combine(
        notificationPrefs.isChannelEnabled(NotificationChannelType.Messages),
        notificationPrefs.isChannelEnabled(NotificationChannelType.Followers),
        notificationPrefs.isChannelEnabled(NotificationChannelType.Likes),
        notificationPrefs.isChannelEnabled(NotificationChannelType.Comments),
        notificationPrefs.isChannelEnabled(NotificationChannelType.NewVideos),
    ) { messages, followers, likes, comments, newVideos ->
        mapOf(
            NotificationChannelType.Messages to messages,
            NotificationChannelType.Followers to followers,
            NotificationChannelType.Likes to likes,
            NotificationChannelType.Comments to comments,
            NotificationChannelType.NewVideos to newVideos,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    fun toggleChannel(channel: NotificationChannelType, enabled: Boolean) {
        viewModelScope.launch {
            notificationPrefs.setChannelEnabled(channel, enabled)
        }
    }
}
