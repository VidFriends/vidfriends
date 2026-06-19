import Foundation

enum Endpoint {
    // Auth
    case register
    case registerWithInvite
    case login
    case refresh

    // Health
    case health

    // Videos
    case createVideo
    case feed
    case videoDetail(id: String)
    case likeVideo(id: String)
    case unlikeVideo(id: String)
    case videoComments(id: String)
    case commentOnVideo(id: String)
    case markWatched(id: String)
    case history

    // User
    case currentUser

    // Social
    case searchUsers
    case sendVideo(id: String)
    case inbox
    case inboxItem(id: String)

    // Friends
    case friends
    case friendRequests
    case respondFriendRequest(id: String)

    // Profile
    case updateProfile

    // Collections
    case collections
    case createCollection
    case collectionDetail(id: String)
    case collectionVideos(id: String)
    case addToCollection(id: String)
    case removeFromCollection(collectionId: String, videoId: String)
    case deleteCollection(id: String)

    // Sent
    case sentVideos
    case unsendVideo(id: String)

    // Push
    case registerPushToken
    case pushSettings

    // Upload
    case uploadVideo
    case videoDownload(id: String)

    // Blocking
    case blockUser(id: String)
    case unblockUser(id: String)
    case blockedUsers

    var path: String {
        switch self {
        case .register: return "/api/auth/register"
        case .registerWithInvite: return "/api/auth/register"
        case .login: return "/api/auth/login"
        case .refresh: return "/api/auth/refresh"
        case .health: return "/api/health"
        case .createVideo: return "/api/videos"
        case .feed: return "/api/feed"
        case .videoDetail(let id): return "/api/videos/\(id)"
        case .likeVideo(let id): return "/api/videos/\(id)/like"
        case .unlikeVideo(let id): return "/api/videos/\(id)/like"
        case .videoComments(let id): return "/api/videos/\(id)/comments"
        case .commentOnVideo(let id): return "/api/videos/\(id)/comment"
        case .markWatched(let id): return "/api/videos/\(id)/watched"
        case .history: return "/api/history"
        case .searchUsers: return "/api/users"
        case .sendVideo(let id): return "/api/videos/\(id)/send"
        case .inbox: return "/api/inbox"
        case .inboxItem(let id): return "/api/inbox/\(id)"
        case .friends: return "/api/friends"
        case .friendRequests: return "/api/friends/requests"
        case .respondFriendRequest(let id): return "/api/friends/\(id)"
        case .currentUser: return "/api/auth/me"
        case .updateProfile: return "/api/auth/me"
        case .collections: return "/api/collections"
        case .createCollection: return "/api/collections"
        case .collectionDetail(let id): return "/api/collections/\(id)"
        case .collectionVideos(let id): return "/api/collections/\(id)/videos"
        case .addToCollection(let id): return "/api/collections/\(id)/videos"
        case .removeFromCollection(let collectionId, let videoId): return "/api/collections/\(collectionId)/videos/\(videoId)"
        case .deleteCollection(let id): return "/api/collections/\(id)"
        case .sentVideos: return "/api/videos/sent"
        case .unsendVideo(let id): return "/api/videos/\(id)/unsend"
        case .registerPushToken: return "/api/push/register"
        case .pushSettings: return "/api/push/settings"
        case .uploadVideo: return "/api/upload"
        case .videoDownload(let id): return "/api/videos/\(id)/download"
        case .blockUser(let id): return "/api/users/\(id)/block"
        case .unblockUser(let id): return "/api/users/\(id)/block"
        case .blockedUsers: return "/api/users/blocked"
        }
    }

    var method: String {
        switch self {
        case .health, .feed, .videoDetail, .videoComments, .history, .searchUsers, .inbox, .friends, .friendRequests, .currentUser, .collections, .collectionDetail, .collectionVideos, .sentVideos, .pushSettings, .blockedUsers, .videoDownload:
            return "GET"
        case .register, .registerWithInvite, .login, .refresh, .createVideo, .likeVideo, .commentOnVideo, .markWatched,
                .sendVideo, .registerPushToken, .uploadVideo, .createCollection, .addToCollection, .unsendVideo, .blockUser:
            return "POST"
        case .unlikeVideo, .removeFromCollection, .deleteCollection, .unblockUser:
            return "DELETE"
        case .inboxItem, .respondFriendRequest, .updateProfile:
            return "PATCH"
        }
    }

    var requiresAuth: Bool {
        switch self {
        case .register, .registerWithInvite, .login, .health:
            return false
        case .refresh, .createVideo, .feed, .videoDetail, .likeVideo, .unlikeVideo,
                .videoComments, .commentOnVideo, .markWatched, .history,
                .currentUser, .searchUsers, .sendVideo, .inbox, .inboxItem,
                .friends, .friendRequests, .respondFriendRequest,
                .registerPushToken, .uploadVideo, .updateProfile,
                .collections, .createCollection, .collectionDetail, .collectionVideos,
                .addToCollection, .removeFromCollection, .deleteCollection, .sentVideos, .unsendVideo,
                .pushSettings, .videoDownload, .blockUser, .unblockUser, .blockedUsers:
            return true
        }
    }
}
