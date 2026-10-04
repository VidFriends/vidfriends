package com.vidfriends.android.ui.navigation

object NavRoutes {
    const val FEED = "feed"
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val VIDEO_DETAIL = "video/{videoId}"
    const val UPLOAD = "upload"
    const val PROFILE = "profile"

    fun videoDetail(videoId: String) = "video/$videoId"
}
