package com.vidflow.app.data.remote

import com.vidflow.app.data.dto.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface VidFriendsApi {

    @POST("api/auth/register")
    suspend fun register(@Body request: RegisterRequestDto): Response<AuthResponseDto>

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequestDto): Response<AuthResponseDto>

    @POST("api/auth/refresh")
    suspend fun refreshToken(@Body request: RefreshRequestDto): Response<AuthResponseDto>

    @GET("api/users/me")
    suspend fun getCurrentUser(): Response<UserDto>

    @PATCH("api/users/me")
    suspend fun updateCurrentUser(@Body request: UpdateUserRequestDto): Response<UserDto>

    @GET("api/feed")
    suspend fun getFeed(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 10,
    ): Response<FeedResponseDto>

    @GET("api/videos/{id}")
    suspend fun getVideo(@Path("id") videoId: String): Response<VideoDto>

    @POST("api/videos/send-link")
    suspend fun sendLink(@Body request: SendLinkRequestDto): Response<VideoDto>

    @Multipart
    @POST("api/videos/upload")
    suspend fun uploadVideo(
        @Part file: MultipartBody.Part,
        @Part("caption") caption: RequestBody?,
    ): Response<VideoDto>

    @POST("api/videos/{id}/like")
    suspend fun likeVideo(@Path("id") videoId: String): Response<Unit>

    @DELETE("api/videos/{id}/like")
    suspend fun unlikeVideo(@Path("id") videoId: String): Response<Unit>

    @GET("api/videos/{id}/comments")
    suspend fun getComments(@Path("id") videoId: String): Response<List<CommentDto>>

    @POST("api/videos/{id}/comments")
    suspend fun addComment(
        @Path("id") videoId: String,
        @Body request: CommentRequestDto,
    ): Response<CommentDto>

    @DELETE("api/videos/{id}/comments/{commentId}")
    suspend fun deleteComment(
        @Path("id") videoId: String,
        @Path("commentId") commentId: String,
    ): Response<Unit>

    @POST("api/videos/{id}/watch")
    suspend fun markWatched(@Path("id") videoId: String): Response<Unit>

    @DELETE("api/videos/{id}")
    suspend fun deleteVideo(@Path("id") videoId: String): Response<Unit>

    @GET("api/videos/{id}/status")
    suspend fun getVideoStatus(@Path("id") videoId: String): Response<VideoStatusDto>

    @GET("api/history")
    suspend fun getHistory(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): Response<HistoryResponseDto>

    @GET("api/health")
    suspend fun healthCheck(): Response<HealthResponseDto>
}
