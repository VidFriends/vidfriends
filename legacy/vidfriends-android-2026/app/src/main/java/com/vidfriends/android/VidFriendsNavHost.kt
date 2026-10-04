package com.vidfriends.android

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.hilt.navigation.compose.hiltViewModel
import com.vidfriends.android.ui.auth.LoginEvent
import com.vidfriends.android.ui.auth.LoginScreen
import com.vidfriends.android.ui.auth.LoginViewModel
import com.vidfriends.android.ui.detail.VideoDetailScreen
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
        composable(NavRoutes.LOGIN) {
            val viewModel: LoginViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsState()
            var showPassword by remember { mutableStateOf(false) }

            androidx.compose.runtime.LaunchedEffect(Unit) {
                viewModel.events.collect { event ->
                    when (event) {
                        is LoginEvent.Authenticated -> {
                            navController.navigate(NavRoutes.FEED) {
                                popUpTo(NavRoutes.LOGIN) { inclusive = true }
                            }
                        }
                        is LoginEvent.NavigateToRegister -> {
                            navController.navigate(NavRoutes.REGISTER)
                        }
                    }
                }
            }

            LoginScreen(
                uiState = uiState,
                onServerUrlChanged = viewModel::onServerUrlChanged,
                onUsernameChanged = viewModel::onUsernameChanged,
                onPasswordChanged = viewModel::onPasswordChanged,
                onLogin = viewModel::login,
                onNavigateToRegister = viewModel::navigateToRegister,
                showPassword = showPassword,
                onTogglePasswordVisibility = { showPassword = !showPassword },
            )
        }

        composable(NavRoutes.REGISTER) {
            RegisterScreenPlaceholder()
        }

        composable(NavRoutes.FEED) {
            FeedScreen(
                onVideoClick = { videoId ->
                    navController.navigate(NavRoutes.videoDetail(videoId))
                },
            )
        }

        composable(
            route = NavRoutes.VIDEO_DETAIL,
            arguments = listOf(navArgument("videoId") { type = NavType.StringType }),
        ) { backStackEntry ->
            val videoId = backStackEntry.arguments?.getString("videoId") ?: return@composable
            VideoDetailScreen(
                videoId = videoId,
                onBack = { navController.popBackStack() },
            )
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

@Composable
private fun RegisterScreenPlaceholder() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "Registration coming soon",
            style = androidx.compose.material3.MaterialTheme.typography.bodyLarge,
        )
    }
}
