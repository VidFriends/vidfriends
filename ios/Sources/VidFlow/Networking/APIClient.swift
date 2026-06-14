import Foundation

actor APIClient: APIClientProtocol {
    private let config: APIConfig
    private let keychainService: KeychainService
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

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

    func login(email: String, password: String) async throws -> String {
        let body = LoginRequest(email: email, password: password)
        let response: AuthResponse = try await perform(.login, body: body, auth: false)
        return response.token
    }

    func refreshToken() async throws -> String {
        let response: AuthResponse = try await perform(.refresh, auth: true)
        return response.token
    }

    // MARK: - Feed

    func getFeed() async throws -> [Video] {
        try await perform(.feed)
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

        struct StatusResponse: Decodable {
            let status: String
        }

        let _: StatusResponse = try await perform(.markWatched(id: videoId), body: body)
    }

    func getHistory() async throws -> [WatchHistoryEntry] {
        try await perform(.history)
    }

    // MARK: - Request Engine

    private func perform<T: Decodable>(
        _ endpoint: Endpoint,
        body: Encodable? = nil,
        auth: Bool? = nil
    ) async throws -> T {
        try await executeRequest(endpoint, body: body, auth: auth ?? endpoint.requiresAuth)
    }

    private func executeRequest<T: Decodable>(
        _ endpoint: Endpoint,
        body: Encodable?,
        auth: Bool
    ) async throws -> T {
        let url = config.baseURL.appendingPathComponent(endpoint.path)

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

        return try handleResponse(data: data, response: httpResponse)
    }

    private func handleResponse<T: Decodable>(data: Data, response: HTTPURLResponse) throws -> T {
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

private struct AuthResponse: Decodable {
    let token: String
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
