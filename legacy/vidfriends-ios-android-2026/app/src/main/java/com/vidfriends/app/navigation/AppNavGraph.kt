package com.vidfriends.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.vidfriends.app.ui.auth.AuthViewModel
import com.vidfriends.app.ui.setup.SetupViewModel
import com.vidfriends.app.ui.collections.CollectionDetailScreen
import com.vidfriends.app.ui.collections.CollectionsScreen
import com.vidfriends.app.ui.detail.VideoDetailScreen
import com.vidfriends.app.ui.downloads.DownloadsScreen
import com.vidfriends.app.ui.feed.FeedScreen
import com.vidfriends.app.ui.history.HistoryScreen
import com.vidfriends.app.ui.settings.BlockedUsersScreen
import com.vidfriends.feature.auth.AuthEvent
import com.vidfriends.feature.auth.AuthScreen
import com.vidfriends.feature.auth.SetupScreen
import com.vidfriends.feature.auth.SetupStatus
import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import com.vidfriends.feature.notifications.ui.NotificationPreferencesScreen
import java.net.URLDecoder

@Composable
fun AppNavGraph(
    startDestination: String = Screen.Feed.route,
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
    initialDeepLink: String? = null,
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier,
    ) {
        composable(Screen.Setup.route) {
            val viewModel: SetupViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            var hasCameraPermission by remember { mutableStateOf(false) }
            val cameraLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.RequestPermission(),
                onResult = { granted -> hasCameraPermission = granted },
            )

            LaunchedEffect(Unit) {
                cameraLauncher.launch(Manifest.permission.CAMERA)
            }

            LaunchedEffect(uiState.status) {
                if (uiState.status == SetupStatus.Connected) {
                    navController.navigate(Screen.Auth.route) {
                        popUpTo(Screen.Setup.route) { inclusive = true }
                    }
                }
            }

            SetupScreen(
                uiState = uiState,
                onServerUrlChanged = viewModel::onServerUrlChanged,
                onConnect = viewModel::connect,
                onQrCodeScanned = viewModel::onQrCodeScanned,
                showScanner = uiState.showScanner,
                hasCameraPermission = hasCameraPermission,
                onToggleScanner = viewModel::toggleScanner,
            )
        }

        composable(Screen.Auth.route) {
            val viewModel: AuthViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            var showPassword by remember { mutableStateOf(false) }

            LaunchedEffect(Unit) {
                viewModel.events.collect { event ->
                    when (event) {
                        AuthEvent.Authenticated -> {
                            navController.navigate(Screen.Feed.route) {
                                popUpTo(Screen.Auth.route) { inclusive = true }
                            }
                        }
                    }
                }
            }

            AuthScreen(
                uiState = uiState,
                onNameChanged = viewModel::onNameChanged,
                onEmailChanged = viewModel::onEmailChanged,
                onPasswordChanged = viewModel::onPasswordChanged,
                onConfirmPasswordChanged = viewModel::onConfirmPasswordChanged,
                onSubmit = viewModel::submit,
                onToggleMode = viewModel::toggleMode,
                showPassword = showPassword,
                onTogglePasswordVisibility = { showPassword = !showPassword },
            )
        }

        composable(Screen.Feed.route) {
            FeedScreen(
                onVideoClick = { videoId ->
                    navController.navigate(Screen.VideoDetail.createRoute(videoId))
                },
                onDuplicateClick = { videoId ->
                    navController.navigate(Screen.VideoDetail.createRoute(videoId))
                },
                onCollectionsClick = {
                    navController.navigate(Screen.Collections.route)
                },
                onDownloadsClick = {
                    navController.navigate(Screen.Downloads.route)
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
                onDuplicateClick = { originalId ->
                    navController.navigate(Screen.VideoDetail.createRoute(originalId))
                },
            )
        }

        composable(Screen.Downloads.route) {
            DownloadsScreen(
                onVideoClick = { videoId ->
                    navController.navigate(Screen.VideoDetail.createRoute(videoId))
                },
            )
        }

        composable(Screen.NotificationPreferences.route) {
            NotificationPreferencesScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Screen.History.route) {
            HistoryScreen(
                onBack = { navController.popBackStack() },
                onBlockedUsersClick = { navController.navigate(Screen.BlockedUsers.route) },
                onDuplicateClick = { videoId ->
                    navController.navigate(Screen.VideoDetail.createRoute(videoId))
                },
            )
        }

        composable(Screen.BlockedUsers.route) {
            BlockedUsersScreen(
                onBack = { navController.popBackStack() },
            )
        }

        composable(Screen.Collections.route) {
            CollectionsScreen(
                onBack = { navController.popBackStack() },
                onCollectionClick = { collectionId ->
                    navController.navigate(Screen.CollectionDetail.createRoute(collectionId))
                },
            )
        }

        composable(
            route = Screen.CollectionDetail.route,
            arguments = listOf(
                navArgument("collectionId") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val collectionId = backStackEntry.arguments?.getString("collectionId") ?: return@composable
            CollectionDetailScreen(
                collectionId = collectionId,
                onBack = { navController.popBackStack() },
                onVideoClick = { videoId ->
                    navController.navigate(Screen.VideoDetail.createRoute(videoId))
                },
            )
        }
    }
}

fun navigateToDeepLink(navController: NavHostController, deepLink: String?) {
    if (deepLink == null) return
    val decoded = URLDecoder.decode(deepLink, "UTF-8")
    when {
        decoded.startsWith("video/") -> {
            val videoId = decoded.removePrefix("video/")
            navController.navigate(Screen.VideoDetail.createRoute(videoId))
        }
        decoded == "feed" -> {
            navController.navigate(Screen.Feed.route) {
                popUpTo(Screen.Feed.route) { inclusive = true }
            }
        }
        decoded == "notification_preferences" -> {
            navController.navigate(Screen.NotificationPreferences.route)
        }
        decoded == "history" -> {
            navController.navigate(Screen.History.route)
        }
        decoded == "blocked-users" -> {
            navController.navigate(Screen.BlockedUsers.route)
        }
        decoded == "collections" -> {
            navController.navigate(Screen.Collections.route)
        }
    }
}
