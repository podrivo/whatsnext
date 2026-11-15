import SwiftUI

struct ContentView: View {
    @Bindable var scheduler: PhraseScheduler
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("WhatsNext")
                .font(.largeTitle.weight(.semibold))

            Text("Local reminders every 2 minutes. No server, works offline after you tap Start.")
                .foregroundStyle(.secondary)

            statusRow

            if let lastError = scheduler.lastError {
                Text(lastError)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            VStack(spacing: 12) {
                Button("Enable notifications") {
                    Task { await scheduler.enableNotifications() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(scheduler.isBusy || scheduler.permission == .authorized)

                Button(scheduler.isArmed ? "Restart schedule" : "Start") {
                    Task { await scheduler.start() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(scheduler.isBusy || scheduler.permission != .authorized)

                Button("Stop", role: .destructive) {
                    Task { await scheduler.stop() }
                }
                .disabled(scheduler.isBusy || !scheduler.isArmed)
            }
            .frame(maxWidth: .infinity)

            Text("iOS allows 64 pending notifications (~2 hours). Tap Start again to refill. Test with Airplane Mode + locked screen.")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer()
        }
        .padding(24)
        .task { await scheduler.refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await scheduler.refresh() }
            }
        }
    }

    private var statusRow: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(statusText)
                .font(.subheadline)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.quaternary.opacity(0.5), in: Capsule())
    }

    private var statusText: String {
        switch scheduler.permission {
        case .authorized, .provisional:
            if scheduler.isArmed {
                return "Armed — \(scheduler.pendingCount) left (~\(scheduler.pendingCount * 2) min)"
            }
            return "Notifications on — tap Start"
        case .denied:
            return "Notifications denied"
        case .notDetermined:
            return "Not enabled yet"
        case .ephemeral:
            return "Ephemeral permission"
        @unknown default:
            return "Unknown permission"
        }
    }

    private var statusColor: Color {
        switch scheduler.permission {
        case .authorized, .provisional:
            return scheduler.isArmed ? .green : .orange
        case .denied:
            return .red
        default:
            return .orange
        }
    }
}

#Preview {
    ContentView(scheduler: PhraseScheduler())
}
