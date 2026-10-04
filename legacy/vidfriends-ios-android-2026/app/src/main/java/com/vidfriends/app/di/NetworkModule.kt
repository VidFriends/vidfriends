package com.vidfriends.app.di

import com.squareup.moshi.Moshi
import com.vidfriends.app.data.remote.ApiErrorInterceptor
import com.vidfriends.app.data.remote.AuthInterceptor
import com.vidfriends.app.data.remote.DynamicBaseUrlInterceptor
import com.vidfriends.app.data.remote.TokenRefreshAuthenticator
import com.vidfriends.app.data.remote.VidFriendsApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideMoshi(): Moshi = Moshi.Builder()
        .build()

    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        dynamicBaseUrlInterceptor: DynamicBaseUrlInterceptor,
        apiErrorInterceptor: ApiErrorInterceptor,
        tokenRefreshAuthenticator: TokenRefreshAuthenticator,
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(dynamicBaseUrlInterceptor)
        .addInterceptor(authInterceptor)
        .addInterceptor(apiErrorInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .authenticator(tokenRefreshAuthenticator)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun provideVidFriendsApi(
        okHttpClient: OkHttpClient,
        moshi: Moshi,
    ): VidFriendsApi = Retrofit.Builder()
        .baseUrl("http://localhost:3100/")
        .client(okHttpClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(VidFriendsApi::class.java)
}
