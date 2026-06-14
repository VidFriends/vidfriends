import Foundation

enum Endpoint {
    // Auth
    case register
    case login
    case refresh

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

    var path: String {
        switch self {
        case .register: return "/api/auth/register"
        case .login: return "/api/auth/login"
        case .refresh: return "/api/auth/refresh"
        case .createVideo: return "/api/videos"
        case .feed: return "/api/feed"
        case .videoDetail(let id): return "/api/videos/\(id)"
        case .likeVideo(let id): return "/api/videos/\(id)/like"
        case .unlikeVideo(let id): return "/api/videos/\(id)/like"
        case .videoComments(let id): return "/api/videos/\(id)/comments"
        case .commentOnVideo(let id): return "/api/videos/\(id)/comment"
        case .markWatched(let id): return "/api/videos/\(id)/watched"
        case .history: return "/api/history"
        }
    }

    var method: String {
        switch self {
        case .feed, .videoDetail, .videoComments, .history:
            return "GET"
        case .register, .login, .refresh, .createVideo, .likeVideo, .commentOnVideo, .markWatched:
            return "POST"
        case .unlikeVideo:
            return "DELETE"
        }
    }

    var requiresAuth: Bool {
        switch self {
        case .register, .login:
            return false
        case .refresh, .createVideo, .feed, .videoDetail, .likeVideo, .unlikeVideo,
                .videoComments, .commentOnVideo, .markWatched, .history:
            return true
        }
    }
}
