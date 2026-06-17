package com.vidfriends.android

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.vidfriends.android.ui.feed.FeedScreen
import com.vidfriends.android.ui.navigation.NavRoutes
import com.vidfriends.android.ui.send.SendScreen

@Composable
fun VidFriendsNavHost() {
    val navController = rememberNavController()
    NavHost(
        navController = navController,
        startDestination = NavRoutes.LOGIN,
    ) {
        composable(NavRoutes.FEED) {
            FeedScreen()
        }
        composable(NavRoutes.UPLOAD) {
            SendScreen(
                onNavigateToFeed = { navController.popBackStack(NavRoutes.FEED, false) },
                onNavigateToVideo = { videoId ->
                    navController.navigate(NavRoutes.videoDetail(videoId)) {
                        popUpTo(NavRoutes.FEED)
                    }
                },
            )
        }
    }
}
