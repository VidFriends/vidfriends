import Foundation

enum OfflineOperationType: Codable {
    case likeVideo(id: String)
    case unlikeVideo(id: String)
    case postComment(videoId: String, body: String, parentId: String?)
    case markWatched(videoId: String, progressSeconds: Int)
    case updateInboxItem(id: String, status: String)
    case respondToFriendRequest(id: String, accept: Bool)
    case blockUser(id: String)
    case unblockUser(id: String)
    case unsendVideo(id: String)
}

actor OfflineOperationQueue {
    private let userDefaults = UserDefaults.standard
    private let queueKey = "com.vidfriends.offline.queue"

    private var pendingOperations: [OfflineOperationPayload] = []

    init() {
        load()
    }

    func enqueue(_ operation: OfflineOperationType) {
        let payload = OfflineOperationPayload(id: UUID().uuidString, type: operation, createdAt: Date())
        pendingOperations.append(payload)
        save()
    }

    func dequeue() -> OfflineOperationPayload? {
        guard !pendingOperations.isEmpty else { return nil }
        return pendingOperations.removeFirst()
    }

    func peek() -> [OfflineOperationPayload] {
        pendingOperations
    }

    func remove(id: String) {
        pendingOperations.removeAll { $0.id == id }
        save()
    }

    var count: Int { pendingOperations.count }

    // MARK: - Persistence

    private func save() {
        guard let data = try? JSONEncoder().encode(pendingOperations) else { return }
        userDefaults.set(data, forKey: queueKey)
    }

    private func load() {
        guard let data = userDefaults.data(forKey: queueKey),
              let operations = try? JSONDecoder().decode([OfflineOperationPayload].self, from: data)
        else { return }
        pendingOperations = operations
    }
}

struct OfflineOperationPayload: Identifiable, Codable {
    let id: String
    let type: OfflineOperationType
    let createdAt: Date
}
