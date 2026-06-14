import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        Group {
            if appState.isAuthenticated {
                Text("VidFlow")
                    .font(.largeTitle)
                    .fontWeight(.bold)
            } else {
                Text("Welcome to VidFlow")
                    .font(.title)
            }
        }
    }
}

#Preview {
    ContentView()
        .environment(AppState())
}
