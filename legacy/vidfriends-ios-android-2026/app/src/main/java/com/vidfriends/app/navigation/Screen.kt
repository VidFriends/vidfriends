package com.vidfriends.app.navigation

sealed class Screen(val route: String) {
    data object Feed : Screen("feed")
    data object VideoDetail : Screen("video/{videoId}") {
        fun createRoute(videoId: String) = "video/$videoId"
    }
    data object Setup : Screen("setup")
    data object Auth : Screen("auth")
    data object Share : Screen("share")
    data object History : Screen("history")
    data object Downloads : Screen("downloads")
    data object BlockedUsers : Screen("blocked-users")
    data object NotificationPreferences : Screen("notification_preferences")
    data object Collections : Screen("collections")
    data object CollectionDetail : Screen("collection/{collectionId}") {
        fun createRoute(collectionId: String) = "collection/$collectionId"
    }
}
