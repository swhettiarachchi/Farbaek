import SwiftUI

/// "Report this result", beside what the AI made (ADR 0173, guideline 1.2). It stays in the app,
/// and it reaches Farbaek's staff under the abuse topic, as it does from the web.
struct ReportLink: View {
    let subject: ReportSheet.Subject
    @Environment(AppModel.self) private var model
    @State private var open = false

    var body: some View {
        Button {
            open = true
        } label: {
            Label("Report this result", systemImage: "flag")
                .frame(minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
        .font(.subheadline)
        .foregroundStyle(Palette.ink2)
        .sheet(isPresented: $open) {
            ReportSheet(subject: subject).environment(model)
        }
    }
}

struct ReportSheet: View {
    enum Subject {
        case task(String)
        case project(String)
    }

    let subject: Subject
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var reason = ""
    @State private var sending = false
    @State private var sent = false
    @State private var failure: String?
    @FocusState private var focused: Bool

    /// The server's limit (REPORT_REASON_MAX in src/server/phone/api.ts).
    private static let limit = 1_000

    private var trimmed: String { reason.trimmingCharacters(in: .whitespacesAndNewlines) }
    /// Counted as the server counts, so Sinhala and emoji aren't refused after the app said they fit.
    private var length: Int { trimmed.utf16.count }
    private var ready: Bool { !trimmed.isEmpty && length <= Self.limit && !sending && !model.isSample }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if sent {
                        Notice(text: "Sent. Farbaek's team reads every report. Any reply appears in Help on the web.", tone: .verified, symbol: "checkmark.circle.fill")
                            .card()
                        helpLink
                        Button("Done") { dismiss() }
                            .buttonStyle(PillButtonStyle(kind: .accent))
                    } else {
                        Text("Something the AI made that's offensive, unsafe, or copied from someone else? Tell Farbaek what's wrong with it.")
                            .font(.subheadline)
                            .foregroundStyle(Palette.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                        TextEditor(text: $reason)
                            .font(.body)
                            .focused($focused)
                            .scrollContentBackground(.hidden)
                            .padding(8)
                            .frame(minHeight: 140)
                            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.input, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Radius.input, style: .continuous).stroke(focused ? Palette.accent : Palette.lineStrong.opacity(0.5), lineWidth: focused ? 2 : 1))
                            .accessibilityLabel("What's wrong with it")
                        if length > Self.limit {
                            Notice(text: "That's \(length) characters. Shorten it to \(Self.limit) to send it.", tone: .failed, symbol: "exclamationmark.circle.fill")
                        }
                        if model.isSample {
                            Notice(text: "This is sample data, so nothing is sent from here.", tone: .simulated, symbol: Tone.simulated.symbol)
                        }
                        if let failure {
                            Notice(text: failure, tone: .failed, symbol: "exclamationmark.circle.fill")
                            helpLink
                        }
                        Button {
                            Task { await send() }
                        } label: {
                            if sending { ProgressView().tint(Palette.onAccent) } else { Text("Send report") }
                        }
                        .buttonStyle(PillButtonStyle(kind: .accent))
                        .disabled(!ready)
                    }
                }
                .padding(16)
            }
            .screenBackground()
            .navigationTitle("Report this result")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !sent { Button("Cancel") { dismiss() } }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var helpLink: some View {
        WebLink(path: "app/help") {
            Label("Open Help on the web", systemImage: "safari")
                .frame(minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
        .font(.subheadline.weight(.medium))
    }

    private func send() async {
        guard !sending else { return }
        failure = nil
        focused = false
        sending = true
        defer { sending = false }
        var payload: [String: Any] = ["reason": trimmed]
        switch subject {
        case .task(let id): payload["taskId"] = id
        case .project(let id): payload["projectId"] = id
        }
        do {
            let _: ReportSent = try await model.api.send("POST", "reports", body: payload)
            sent = true
        } catch {
            failure = error.localizedDescription
        }
    }
}
