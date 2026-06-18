import Foundation

actor APIClient: APIClientProtocol {
    private let config: APIConfig
    private let keychainService: KeychainService
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var interceptor: AuthInterceptor?

    init(config: APIConfig, keychainService: KeychainService) {
        self.config = config
        self.keychainService = keychainService

        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = 30
        sessionConfig.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: sessionConfig)

        self.decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        self.encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    // MARK: - Auth

    func register(email: String, username: String, password: String, displayName: String?) async throws -> String {
        let body = AuthRequest(email: email, username: username, password: password, displayName: displayName)
        let response: AuthResponse = try await perform(.register, body: body, auth: false)
        return response.token
    }

    func registerWithInvite(email: String, username: String, password: String, displayName: String?, inviteCode: String) async throws -> String {
        let body = InviteSignupRequest(email: email, username: username, password: password, displayName: displayName, inviteCode: inviteCode)
        let response: AuthResponse = try await perform(.registerWithInvite, body: body, auth: false)
        return response.token
    }

    func login(email: String, password: String) async throws -> String {
        let body = LoginRequest(email: email, password: password)
        let response: AuthResponse = try await perform(.login, body: body, auth: false)
        return response.token
    }

    func refreshToken() async throws -> String {
        let response: AuthResponse = try await executeRequest(.refresh, body: nil, auth: true)
        config.token = response.token
        keychainService.saveToken(response.token)
        return response.token
    }

    func setInterceptor(_ interceptor: AuthInterceptor) {
        self.interceptor = interceptor
    }

    // MARK: - Health

    func checkHealth() async throws -> Bool {
        let response: HealthResponse = try await perform(.health, auth: false)
        return response.status == "ok" || response.status == "healthy"
    }

    // MARK: - Feed

    func getFeed() async throws -> [Video] {
        try await perform(.feed)
    }

    func getPaginatedFeed(cursor: String?) async throws -> FeedResponse {
        let queryItems: [URLQueryItem] = cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? []
        return try await perform(.feed, queryItems: queryItems.isEmpty ? nil : queryItems)
    }

    // MARK: - Videos

    func getVideoDetail(id: String) async throws -> Video {
        try await perform(.videoDetail(id: id))
    }

    func createVideo(url: String?, title: String?, description: String?) async throws -> String {
        let body = CreateVideoRequest(url: url, title: title, description: description)
        let response: CreateVideoResponse = try await perform(.createVideo, body: body)
        return response.id
    }

    func likeVideo(id: String) async throws {
        let _: LikeResponse = try await perform(.likeVideo(id: id))
    }

    func unlikeVideo(id: String) async throws {
        let _: LikeResponse = try await perform(.unlikeVideo(id: id))
    }

    func getComments(videoId: String) async throws -> [Comment] {
        try await perform(.videoComments(id: videoId))
    }

    func postComment(videoId: String, body: String, parentId: String?) async throws -> CreateCommentResponse {
        let body = CreateCommentRequest(body: body, parentId: parentId)
        return try await perform(.commentOnVideo(id: videoId), body: body)
    }

    func markWatched(videoId: String, progressSeconds: Int) async throws {
        let body = MarkWatchedRequest(progressSeconds: progressSeconds)
        let _: StatusResponse = try await perform(.markWatched(id: videoId), body: body)
    }

    func getHistory() async throws -> [WatchHistoryEntry] {
        try await perform(.history)
    }

    // MARK: - Social

    func searchUsers(query: String) async throws -> [UserSearchResult] {
        let response: UserSearchResponse = try await perform(
            .searchUsers,
            queryItems: [URLQueryItem(name: "q", value: query)]
        )
        return response.users
    }

    func sendVideo(id: String, toUserId: String) async throws {
        let body = SendVideoRequest(toUserId: toUserId)
        let _: StatusResponse = try await perform(.sendVideo(id: id), body: body)
    }

    func getInbox() async throws -> [InboxItem] {
        try await perform(.inbox)
    }

    func updateInboxItem(id: String, status: String) async throws {
        let body = InboxUpdateRequest(status: status)
        let _: StatusResponse = try await perform(.inboxItem(id: id), body: body)
    }

    // MARK: - Friends

    func getFriends() async throws -> [Friend] {
        try await perform(.friends)
    }

    func getFriendRequests() async throws -> [Friend] {
        try await perform(.friendRequests)
    }

    func respondToFriendRequest(id: String, accept: Bool) async throws {
        let body = FriendRequestAction(status: accept ? "accepted" : "rejected")
        let _: StatusResponse = try await perform(.respondFriendRequest(id: id), body: body)
    }

    // MARK: - User

    func getCurrentUser() async throws -> User {
        try await perform(.currentUser)
    }

    // MARK: - User Profile

    func updateProfile(displayName: String?) async throws -> User {
        let body = UpdateProfileRequest(displayName: displayName)
        return try await perform(.updateProfile, body: body)
    }

    // MARK: - Collections

    func getCollections() async throws -> [Collection] {
        try await perform(.collections)
    }

    func createCollection(name: String) async throws -> Collection {
        let body = CreateCollectionRequest(name: name)
        return try await perform(.createCollection, body: body)
    }

    func getCollectionVideos(id: String) async throws -> [VideoWithUser] {
        try await perform(.collectionVideos(id: id))
    }

    func addVideoToCollection(collectionId: String, videoId: String) async throws {
        let body = AddToCollectionRequest(videoId: videoId)
        let _: StatusResponse = try await perform(.addToCollection(id: collectionId), body: body)
    }

    func removeVideoFromCollection(collectionId: String, videoId: String) async throws {
        let _: StatusResponse = try await perform(.removeFromCollection(collectionId: collectionId, videoId: videoId))
    }

    func deleteCollection(id: String) async throws {
        let _: StatusResponse = try await perform(.deleteCollection(id: id))
    }

    // MARK: - Sent

    func getSentVideos() async throws -> [SentVideo] {
        try await perform(.sentVideos)
    }

    func unsendVideo(id: String) async throws {
        let _: StatusResponse = try await perform(.unsendVideo(id: id))
    }

    // MARK: - Push
    
    func registerPushToken(token: String) async throws {
        let body = PushRegisterRequest(token: token, platform: "ios")
        let _: StatusResponse = try await perform(.registerPushToken, body: body)
    }

    func getPushSettings() async throws -> PushSettings {
        try await perform(.pushSettings)
    }

    func updatePushSettings(notificationsEnabled: Bool) async throws {
        let body = PushSettingsUpdate(notificationsEnabled: notificationsEnabled)
        let _: StatusResponse = try await perform(.pushSettings, body: body)
    }

    // MARK: - Upload / Download

    func downloadVideo(id: String) async throws -> VideoDownloadResponse {
        try await perform(.videoDownload(id: id))
    }

    func uploadVideo(fileURL: URL, fileName: String, progress: (@Sendable (Double) -> Void)?) async throws -> String {
        let boundary = "Boundary-\(UUID().uuidString)"
        let tempDir = FileManager.default.temporaryDirectory
        let tempFileURL = tempDir.appendingPathComponent("multipart-\(UUID().uuidString).tmp")

        guard let outputStream = OutputStream(url: tempFileURL, append: false) else {
            throw APIError.networkError("Failed to create temp file for upload")
        }
        outputStream.open()
        defer { outputStream.close() }

        try writeMultipartHeader(outputStream: outputStream, boundary: boundary, fileName: fileName)
        try streamFileToStream(fileURL: fileURL, outputStream: outputStream)
        try writeMultipartFooter(outputStream: outputStream, boundary: boundary)

        let url = config.baseURL.appendingPathComponent(Endpoint.uploadVideo.path)
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = Endpoint.uploadVideo.method
        urlRequest.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        try attachAuth(&urlRequest)

        let uploadSession = UploadDelegateSession(progress: progress)
        let (data, response) = try await uploadSession.upload(request: urlRequest, fileURL: tempFileURL)

        try? FileManager.default.removeItem(at: tempFileURL)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        let uploadResponse: UploadResponse = try handleData(data: data, response: httpResponse)
        return uploadResponse.url
    }

    // MARK: - Multipart Streaming Helpers

    private func writeMultipartHeader(outputStream: OutputStream, boundary: String, fileName: String) throws {
        let header = "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\nContent-Type: video/mp4\r\n\r\n"
        guard let data = header.data(using: .utf8) else {
            throw APIError.networkError("Failed to encode multipart header")
        }
        try writeToStream(outputStream, data: data)
    }

    private func writeToStream(_ stream: OutputStream, data: Data) throws {
        let written = data.withUnsafeBytes { buffer in
            guard let ptr = buffer.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return -1 }
            return stream.write(ptr, maxLength: data.count)
        }
        guard written == data.count else {
            throw APIError.networkError("Failed to write multipart data to temp file")
        }
    }

    private func writeMultipartFooter(outputStream: OutputStream, boundary: String) throws {
        let footer = "\r\n--\(boundary)--\r\n"
        guard let data = footer.data(using: .utf8) else {
            throw APIError.networkError("Failed to encode multipart footer")
        }
        try writeToStream(outputStream, data: data)
    }

    private func streamFileToStream(fileURL: URL, outputStream: OutputStream) throws {
        guard let inputStream = InputStream(url: fileURL) else {
            throw APIError.networkError("Failed to open video file for streaming")
        }
        inputStream.open()
        defer { inputStream.close() }

        let bufferSize = 1_024 * 1_024 // 1MB chunks
        var buffer = [UInt8](repeating: 0, count: bufferSize)
        while inputStream.hasBytesAvailable {
            let read = inputStream.read(&buffer, maxLength: bufferSize)
            guard read >= 0 else {
                throw APIError.networkError("Failed to read video file")
            }
            if read > 0 {
                let written = outputStream.write(buffer, maxLength: read)
                guard written == read else {
                    throw APIError.networkError("Failed to write video chunk to temp file")
                }
            }
        }
    }

    // MARK: - Blocking

    func blockUser(id: String) async throws {
        let _: StatusResponse = try await perform(.blockUser(id: id))
    }

    func unblockUser(id: String) async throws {
        let _: StatusResponse = try await perform(.unblockUser(id: id))
    }

    func getBlockedUsers() async throws -> [BlockedUser] {
        try await perform(.blockedUsers)
    }

    // MARK: - Request Engine

    private func perform<T: Decodable>(
        _ endpoint: Endpoint,
        body: Encodable? = nil,
        queryItems: [URLQueryItem]? = nil,
        auth: Bool? = nil
    ) async throws -> T {
        let requiresAuth = auth ?? endpoint.requiresAuth
        let operation = { try await self.executeRequest(endpoint, body: body, queryItems: queryItems, auth: requiresAuth) as T }

        if requiresAuth, let interceptor {
            return try await interceptor.intercept(operation)
        }
        return try await operation()
    }

    private func executeRequest<T: Decodable>(
        _ endpoint: Endpoint,
        body: Encodable?,
        queryItems: [URLQueryItem]? = nil,
        auth: Bool
    ) async throws -> T {
        var url = config.baseURL.appendingPathComponent(endpoint.path)

        if let queryItems, !queryItems.isEmpty {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: true)
            components?.queryItems = queryItems
            if let urlWithQuery = components?.url {
                url = urlWithQuery
            }
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = endpoint.method
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if auth {
            guard let token = config.token else {
                throw APIError.unauthorized
            }
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            urlRequest.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response): (Data, URLResponse)

        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            throw APIError.networkError(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        return try handleData(data: data, response: httpResponse)
    }

    private func attachAuth(_ request: inout URLRequest) throws {
        guard let token = config.token else {
            throw APIError.unauthorized
        }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }

    private func handleData<T: Decodable>(data: Data, response: HTTPURLResponse) throws -> T {
        switch response.statusCode {
        case 200...299:
            do {
                return try decoder.decode(T.self, from: data)
            } catch {
                throw APIError.decodingFailed(error.localizedDescription)
            }

        case 401:
            throw APIError.unauthorized

        case 404:
            throw APIError.notFound

        default:
            let message = try? decoder.decode(ErrorBody.self, from: data).error
            throw APIError.serverError(statusCode: response.statusCode, message: message)
        }
    }
}

// MARK: - Upload Progress Helper

private final class UploadDelegateSession: NSObject, URLSessionTaskDelegate {
    private let progress: (@Sendable (Double) -> Void)?
    private var session: URLSession?

    init(progress: (@Sendable (Double) -> Void)?) {
        self.progress = progress
    }

    func upload(request: URLRequest, data: Data) async throws -> (Data, URLResponse) {
        let delegateSession = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        self.session = delegateSession
        defer { delegateSession.invalidateAndCancel() }
        return try await delegateSession.upload(for: request, from: data)
    }

    func upload(request: URLRequest, fileURL: URL) async throws -> (Data, URLResponse) {
        let delegateSession = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        self.session = delegateSession
        defer { delegateSession.invalidateAndCancel() }
        return try await delegateSession.upload(for: request, fromFile: fileURL)
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        let fraction = Double(totalBytesSent) / Double(totalBytesExpectedToSend)
        progress?(fraction)
    }
}

// MARK: - Request/Response Bodies

private struct AuthRequest: Encodable {
    let email: String
    let username: String
    let password: String
    let displayName: String?
}

private struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct InviteSignupRequest: Encodable {
    let email: String
    let username: String
    let password: String
    let displayName: String?
    let inviteCode: String

    enum CodingKeys: String, CodingKey {
        case email, username, password
        case displayName = "display_name"
        case inviteCode = "invite_code"
    }
}

private struct AuthResponse: Decodable {
    let token: String
}

private struct AddToCollectionRequest: Encodable {
    let videoId: String

    enum CodingKeys: String, CodingKey {
        case videoId = "video_id"
    }
}

private struct PushSettingsUpdate: Encodable {
    let notificationsEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case notificationsEnabled = "notifications_enabled"
    }
}

private struct ErrorBody: Decodable {
    let error: String
}

// MARK: - Type Erasure Helper

private struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void

    init(_ wrapped: Encodable) {
        _encode = { encoder in
            try wrapped.encode(to: encoder)
        }
    }

    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}

// MARK: - Response Types

private extension APIClient {
    struct HealthResponse: Decodable {
        let status: String
    }
}
