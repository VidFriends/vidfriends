import Foundation
import Network

@Observable
final class NetworkMonitorService {
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.vidfriends.network-monitor")

    private(set) var isConnected = true

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isConnected = path.status == .satisfied
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}
