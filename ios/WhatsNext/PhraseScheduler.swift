import Foundation
import UserNotifications

/// Schedules on-device local notifications. No server, works offline / Airplane Mode.
/// iOS caps pending requests at 64, so we queue ~2 hours at a time and refill on Start / foreground.
@MainActor
@Observable
final class PhraseScheduler {
    private static let intervalSeconds: TimeInterval = 2 * 60
    private static let batchCount = 64
    private static let idPrefix = "whatsnext.phrase."

    private static let phrases = [
        "Drink some water.",
        "Stand up and stretch.",
        "Look away from the screen for 20 seconds.",
        "Take a slow breath in… and out.",
        "Check your posture.",
        "Send that message you've been putting off.",
        "A short walk beats another scroll.",
        "What's one thing you can finish in 5 minutes?",
        "Put your phone down for a minute.",
        "You don't have to do everything today.",
        "Open a window. Fresh air helps.",
        "Name three things you're glad exist.",
    ]

    var permission: UNAuthorizationStatus = .notDetermined
    var pendingCount = 0
    var lastError: String?
    var isBusy = false

    var isArmed: Bool { pendingCount > 0 }

    func refresh() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        permission = settings.authorizationStatus
        let pending = await center.pendingNotificationRequests()
        pendingCount = pending.filter { $0.identifier.hasPrefix(Self.idPrefix) }.count
    }

    func enableNotifications() async {
        isBusy = true
        lastError = nil
        defer { isBusy = false }

        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            await refresh()
            if !granted {
                lastError = "Permission denied. Enable in Settings → Notifications → WhatsNext."
            }
        } catch {
            lastError = error.localizedDescription
            await refresh()
        }
    }

    func start() async {
        isBusy = true
        lastError = nil
        defer { isBusy = false }

        await refresh()
        guard permission == .authorized || permission == .provisional else {
            lastError = "Enable notifications first."
            return
        }

        await cancelScheduled()

        let center = UNUserNotificationCenter.current()
        for index in 0..<Self.batchCount {
            let content = UNMutableNotificationContent()
            content.title = "WhatsNext"
            content.body = Self.phrases.randomElement() ?? "Pause for a second."
            content.sound = .default

            let trigger = UNTimeIntervalNotificationTrigger(
                timeInterval: Self.intervalSeconds * TimeInterval(index + 1),
                repeats: false
            )
            let request = UNNotificationRequest(
                identifier: "\(Self.idPrefix)\(index)",
                content: content,
                trigger: trigger
            )
            do {
                try await center.add(request)
            } catch {
                lastError = error.localizedDescription
                break
            }
        }

        await refresh()
    }

    func stop() async {
        isBusy = true
        lastError = nil
        defer { isBusy = false }
        await cancelScheduled()
        await refresh()
    }

    private func cancelScheduled() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let ids = pending
            .map(\.identifier)
            .filter { $0.hasPrefix(Self.idPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }
}
