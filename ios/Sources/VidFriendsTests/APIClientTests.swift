import Testing
import Foundation
@testable import VidFriends

struct APIClientTests {

    @Test("Endpoint path for login")
    func endpointLoginPath() {
        #expect(Endpoint.login.path == "/api/auth/login")
        #expect(Endpoint.login.method == "POST")
        #expect(Endpoint.login.requiresAuth == false)
    }

    @Test("Endpoint path for feed")
    func endpointFeedPath() {
        #expect(Endpoint.feed.path == "/api/feed")
        #expect(Endpoint.feed.method == "GET")
        #expect(Endpoint.feed.requiresAuth == true)
    }

    @Test("Endpoint path for video detail")
    func endpointVideoDetailPath() {
        #expect(Endpoint.videoDetail(id: "abc-123").path == "/api/videos/abc-123")
        #expect(Endpoint.videoDetail(id: "abc-123").method == "GET")
    }

    @Test("Endpoint path for like/unlike")
    func endpointLikeUnlikePath() {
        #expect(Endpoint.likeVideo(id: "v1").path == "/api/videos/v1/like")
        #expect(Endpoint.likeVideo(id: "v1").method == "POST")
        #expect(Endpoint.unlikeVideo(id: "v1").path == "/api/videos/v1/like")
        #expect(Endpoint.unlikeVideo(id: "v1").method == "DELETE")
    }

    @Test("APIError descriptions are non-empty")
    func apiErrorDescriptions() {
        #expect(APIError.unauthorized.errorDescription?.isEmpty == false)
        #expect(APIError.notFound.errorDescription?.isEmpty == false)
        #expect(APIError.invalidURL.errorDescription?.isEmpty == false)
        #expect(APIError.tokenExpired.errorDescription?.isEmpty == false)
    }

    // MARK: - Social Endpoints

    @Test("Endpoint path for search users")
    func endpointSearchUsers() {
        #expect(Endpoint.searchUsers.path == "/api/users")
        #expect(Endpoint.searchUsers.method == "GET")
        #expect(Endpoint.searchUsers.requiresAuth == true)
    }

    @Test("Endpoint path for send video")
    func endpointSendVideo() {
        #expect(Endpoint.sendVideo(id: "v1").path == "/api/videos/v1/send")
        #expect(Endpoint.sendVideo(id: "v1").method == "POST")
        #expect(Endpoint.sendVideo(id: "v1").requiresAuth == true)
    }

    @Test("Endpoint path for inbox")
    func endpointInbox() {
        #expect(Endpoint.inbox.path == "/api/inbox")
        #expect(Endpoint.inbox.method == "GET")
        #expect(Endpoint.inbox.requiresAuth == true)
    }

    @Test("Endpoint path for inbox item")
    func endpointInboxItem() {
        #expect(Endpoint.inboxItem(id: "in1").path == "/api/inbox/in1")
        #expect(Endpoint.inboxItem(id: "in1").method == "PATCH")
        #expect(Endpoint.inboxItem(id: "in1").requiresAuth == true)
    }

    @Test("Endpoint path for friends")
    func endpointFriends() {
        #expect(Endpoint.friends.path == "/api/friends")
        #expect(Endpoint.friends.method == "GET")
        #expect(Endpoint.friends.requiresAuth == true)
    }

    @Test("Endpoint path for friend requests")
    func endpointFriendRequests() {
        #expect(Endpoint.friendRequests.path == "/api/friends/requests")
        #expect(Endpoint.friendRequests.method == "GET")
        #expect(Endpoint.friendRequests.requiresAuth == true)
    }

    @Test("Endpoint path for respond friend request")
    func endpointRespondFriendRequest() {
        #expect(Endpoint.respondFriendRequest(id: "f1").path == "/api/friends/f1")
        #expect(Endpoint.respondFriendRequest(id: "f1").method == "PATCH")
        #expect(Endpoint.respondFriendRequest(id: "f1").requiresAuth == true)
    }

    @Test("Endpoint path for current user")
    func endpointCurrentUser() {
        #expect(Endpoint.currentUser.path == "/api/auth/me")
        #expect(Endpoint.currentUser.method == "GET")
        #expect(Endpoint.currentUser.requiresAuth == true)
    }

    @Test("Endpoint path for register push token")
    func endpointRegisterPushToken() {
        #expect(Endpoint.registerPushToken.path == "/api/push/register")
        #expect(Endpoint.registerPushToken.method == "POST")
        #expect(Endpoint.registerPushToken.requiresAuth == true)
    }

    @Test("Endpoint path for upload video")
    func endpointUploadVideo() {
        #expect(Endpoint.uploadVideo.path == "/api/upload")
        #expect(Endpoint.uploadVideo.method == "POST")
        #expect(Endpoint.uploadVideo.requiresAuth == true)
    }

    // MARK: - New Profile, History & Collections Endpoints

    @Test("Endpoint path for update profile")
    func endpointUpdateProfile() {
        #expect(Endpoint.updateProfile.path == "/api/auth/me")
        #expect(Endpoint.updateProfile.method == "PATCH")
        #expect(Endpoint.updateProfile.requiresAuth == true)
    }

    @Test("Endpoint path for collections")
    func endpointCollections() {
        #expect(Endpoint.collections.path == "/api/collections")
        #expect(Endpoint.collections.method == "GET")
        #expect(Endpoint.collections.requiresAuth == true)
    }

    @Test("Endpoint path for create collection")
    func endpointCreateCollection() {
        #expect(Endpoint.createCollection.path == "/api/collections")
        #expect(Endpoint.createCollection.method == "POST")
        #expect(Endpoint.createCollection.requiresAuth == true)
    }

    @Test("Endpoint path for collection detail")
    func endpointCollectionDetail() {
        #expect(Endpoint.collectionDetail(id: "c1").path == "/api/collections/c1")
        #expect(Endpoint.collectionDetail(id: "c1").method == "GET")
    }

    @Test("Endpoint path for collection videos")
    func endpointCollectionVideos() {
        #expect(Endpoint.collectionVideos(id: "c1").path == "/api/collections/c1/videos")
        #expect(Endpoint.collectionVideos(id: "c1").method == "GET")
    }

    @Test("Endpoint path for add to collection")
    func endpointAddToCollection() {
        #expect(Endpoint.addToCollection(id: "c1").path == "/api/collections/c1/videos")
        #expect(Endpoint.addToCollection(id: "c1").method == "POST")
    }

    @Test("Endpoint path for remove from collection")
    func endpointRemoveFromCollection() {
        #expect(Endpoint.removeFromCollection(collectionId: "c1", videoId: "v1").path == "/api/collections/c1/videos/v1")
        #expect(Endpoint.removeFromCollection(collectionId: "c1", videoId: "v1").method == "DELETE")
    }

    @Test("Endpoint path for delete collection")
    func endpointDeleteCollection() {
        #expect(Endpoint.deleteCollection(id: "c1").path == "/api/collections/c1")
        #expect(Endpoint.deleteCollection(id: "c1").method == "DELETE")
    }

    @Test("Endpoint path for sent videos")
    func endpointSentVideos() {
        #expect(Endpoint.sentVideos.path == "/api/videos/sent")
        #expect(Endpoint.sentVideos.method == "GET")
        #expect(Endpoint.sentVideos.requiresAuth == true)
    }
}
