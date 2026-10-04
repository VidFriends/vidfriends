import Foundation

enum APIError: Error, LocalizedError, Equatable {
    case invalidURL
    case invalidResponse
    case unauthorized
    case notFound
    case serverError(statusCode: Int, message: String?)
    case networkError(String)
    case decodingFailed(String)
    case tokenExpired
    case refreshFailed

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .invalidResponse: return "Invalid response from server"
        case .unauthorized: return "Authentication failed"
        case .notFound: return "Resource not found"
        case .serverError(let code, let msg): return msg ?? "Server error (\(code))"
        case .networkError(let err): return "Network error: \(err)"
        case .decodingFailed: return "Failed to process server response"
        case .tokenExpired: return "Session expired. Please log in again."
        case .refreshFailed: return "Unable to refresh session"
        }
    }
}
