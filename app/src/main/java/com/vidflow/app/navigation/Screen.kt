package com.vidflow.app.navigation

sealed class Screen(val route: String) {
    data object Feed : Screen("feed")
    data object VideoDetail : Screen("video/{videoId}") {
        fun createRoute(videoId: String) = "video/$videoId"
    }
    data object Auth : Screen("auth")
    data object Share : Screen("share")
    data object History : Screen("history")
}
