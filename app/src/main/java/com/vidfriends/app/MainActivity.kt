package com.vidfriends.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.navigation.compose.rememberNavController
import com.vidfriends.app.data.preferences.UserPreferences
import com.vidfriends.app.navigation.AppNavGraph
import com.vidfriends.app.navigation.Screen
import com.vidfriends.app.navigation.navigateToDeepLink
import com.vidfriends.app.theme.VidFriendsTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var userPreferences: UserPreferences

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val deepLink = intent?.getStringExtra("deep_link")

        setContent {
            val navController = rememberNavController()

            var startDestination by remember { mutableStateOf<String?>(null) }

            LaunchedEffect(Unit) {
                val hasServerUrl = runBlocking { userPreferences.serverUrl } != null
                val isLoggedIn = runBlocking { userPreferences.accessToken } != null
                startDestination = when {
                    !hasServerUrl -> Screen.Setup.route
                    !isLoggedIn -> Screen.Auth.route
                    else -> Screen.Feed.route
                }
            }

            LaunchedEffect(deepLink) {
                deepLink?.let { navigateToDeepLink(navController, it) }
            }

            val destination = startDestination
            if (destination != null) {
                VidFriendsTheme {
                    AppNavGraph(
                        navController = navController,
                        startDestination = destination,
                    )
                }
            }
        }
    }
}
