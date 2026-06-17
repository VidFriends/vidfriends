# Keep Moshi adapters
-keep class com.vidfriends.android.data.dto.** { *; }
-keep class com.squareup.moshi.** { *; }

# Keep Retrofit interfaces
-keep,allowobfuscation interface com.vidfriends.android.data.remote.VidFriendsApi

# Keep Hilt
-keep class dagger.hilt.** { *; }
