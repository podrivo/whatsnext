import SwiftUI

@main
struct WhatsNextApp: App {
    @State private var scheduler = PhraseScheduler()

    var body: some Scene {
        WindowGroup {
            ContentView(scheduler: scheduler)
        }
    }
}
