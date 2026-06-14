package com.vidflow.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.vidflow.app.ui.detail.VideoDetailScreen
import com.vidflow.app.ui.feed.FeedScreen

@Composable
fun AppNavGraph(
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
) {
    NavHost(
        navController = navController,
        startDestination = Screen.Feed.route,
        modifier = modifier,
    ) {
        composable(Screen.Feed.route) {
            FeedScreen(
                onVideoClick = { videoId ->
                    navController.navigate(Screen.VideoDetail.createRoute(videoId))
                },
            )
        }

        composable(
            route = Screen.VideoDetail.route,
            arguments = listOf(
                navArgument("videoId") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val videoId = backStackEntry.arguments?.getString("videoId") ?: return@composable
            VideoDetailScreen(
                videoId = videoId,
                onBack = { navController.popBackStack() },
            )
        }
    }
}
