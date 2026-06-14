import SwiftUI
import SwiftData

@main
struct VidFlowApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
        }
        .modelContainer(for: [
            UserModel.self,
            VideoModel.self,
            FriendModel.self,
        ])
    }
}
