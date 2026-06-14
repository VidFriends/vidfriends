# Keep Hilt
-keepclassmembers class * {
    @dagger.hilt.android.EarlyEntryPoint *;
}

# Keep Moshi (when added)
-dontwarn okhttp3.**
-dontwarn retrofit2.**
