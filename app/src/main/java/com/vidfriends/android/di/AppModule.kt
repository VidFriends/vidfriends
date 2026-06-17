package com.vidfriends.android.di

import com.vidfriends.android.data.remote.ApiErrorInterceptor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideApiErrorInterceptor(): ApiErrorInterceptor = ApiErrorInterceptor()
}
