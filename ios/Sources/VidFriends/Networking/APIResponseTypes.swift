import Foundation

struct StatusResponse: Decodable {
    let status: String
}

struct FeedResponse: Decodable {
    let videos: [Video]
    let nextCursor: String?
}
