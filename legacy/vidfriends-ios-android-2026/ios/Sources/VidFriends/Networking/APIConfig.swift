import Foundation

class APIConfig {
    var baseURL: URL
    var useStub: Bool
    var token: String?

    init(baseURL: URL = URL(string: "http://localhost:8080")!, useStub: Bool = false, token: String? = nil) {
        self.baseURL = baseURL
        self.useStub = useStub
        self.token = token
    }
}
