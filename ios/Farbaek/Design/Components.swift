import SwiftUI
import UIKit

// White Signal on iPhone (ADR 0008, ADR 0110): the web's colours (Tokens.swift),
// its shapes (pill buttons, 12pt inputs, 20pt cards, 28pt panels) and its rule
// that status never relies on colour alone. Text is Apple's system font; codes,
// hashes and paths are its monospaced face. Status (ADR 0183): blue is "your
// turn", burnt orange a real warning, steel information and work in progress.

enum Radius {
    static let input: CGFloat = 12
    static let card: CGFloat = 20
    static let panel: CGFloat = 28
}

struct CardModifier: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).stroke(Palette.line, lineWidth: 1))
            .shadow(color: Palette.ink.opacity(0.04), radius: 2, x: 0, y: 1)
    }
}

/// The double bezel: a raised 28pt shell around a 20pt card, so the curves stay concentric.
struct PanelModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            // Shadows are tinted with ink, never with the accent (ADR 0183).
            .shadow(color: Palette.ink.opacity(0.08), radius: 16, x: 0, y: 10)
            .padding(8)
            .background(Palette.surfaceRaised.opacity(0.7), in: RoundedRectangle(cornerRadius: Radius.panel, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.panel, style: .continuous).stroke(Palette.line, lineWidth: 1))
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View { modifier(CardModifier(padding: padding)) }
    func panel() -> some View { modifier(PanelModifier()) }

    func screenBackground() -> some View {
        scrollContentBackground(.hidden).background(Palette.canvas.ignoresSafeArea())
    }
}

/// Where something stands (ADR 0183): the web's thirteen kinds (src/components/ui/status-badge.tsx), each with
/// its words, its SF Symbol twin of the web's icon, its colour and its border, so no state relies on one of them.
/// Filled symbols report a state; the dashed circle means "not yet".
enum Tone: String, CaseIterable {
    case verified, done, approval, pending, working, attention, paused, failed, blocked, unverified, off, info, simulated

    /// The API's tone strings ("verified", "approval", "failed", "unverified", "info", "neutral") and the kinds' own
    /// names. "neutral" is a plain fact, so it reads as information, and so does a word this build doesn't know.
    init(_ raw: String) {
        if raw == "neutral" {
            self = .info
        } else {
            self = Tone(rawValue: raw) ?? .info
        }
    }

    /// A task's kind from its state, the same as the web's stateKind() in src/core/realityloop/progress.ts. A state
    /// this build doesn't know yet falls back to the tone the API sends with it.
    init(taskState state: String, tone: String) {
        switch state {
        case "VERIFIED", "RECOVERED": self = .verified
        case "CONTRACT_DRAFTED", "APPROVAL_PENDING", "REVIEW_REQUIRED", "REQUIRES_HUMAN_INTERVENTION": self = .approval
        case "CONTRACT_APPROVED": self = .done
        case "RECEIVED", "EXECUTION_AUTHORIZED": self = .pending
        case "CONTEXT_ASSEMBLED", "PLAN_PROPOSED", "POLICY_EVALUATED", "EXECUTING", "VERIFYING", "RECOVERY_PENDING": self = .working
        case "PARTIALLY_VERIFIED": self = .attention
        case "INTERRUPTED": self = .paused
        case "FAILED", "REJECTED": self = .failed
        case "BLOCKED": self = .blocked
        case "CANCELLED", "EXPIRED": self = .off
        default: self = Tone(tone)
        }
    }

    var color: Color {
        switch self {
        case .verified: return Palette.verified
        case .done: return Palette.ink2
        case .approval: return Palette.approval
        case .pending, .working, .info: return Palette.info
        case .attention, .paused: return Palette.caution
        case .failed, .blocked: return Palette.failed
        case .unverified: return Palette.unverified
        case .off: return Palette.ink3
        case .simulated: return Palette.simulated
        }
    }

    /// Every kind has its mark, the SF Symbol twin of the web's Phosphor icon.
    var symbol: String {
        switch self {
        case .verified, .done: return "checkmark.circle.fill"
        case .approval: return Self.approvalSymbol
        case .pending: return "clock.fill"
        case .working: return "arrow.triangle.2.circlepath"
        case .attention: return "exclamationmark.circle.fill"
        case .paused: return "pause.circle.fill"
        case .failed: return "xmark.circle.fill"
        case .blocked: return "nosign"
        case .unverified: return "circle.dashed"
        case .off: return "minus.circle.fill"
        case .info: return "info.circle.fill"
        case .simulated: return "eye.fill"
        }
    }

    /// The web's ClockUser, a person with a clock, where this iOS draws it; the plain clock where it doesn't.
    private static let approvalSymbol: String = ["person.crop.circle.badge.clock.fill", "person.crop.circle.badge.clock"].first { UIImage(systemName: $0) != nil } ?? "clock.fill"

    /// The border, as on the web: the kind's colour, or the quiet outline for done, off and sample.
    var border: Color {
        switch self {
        case .done, .off, .simulated: return Palette.line2
        case .pending, .working, .info: return color.opacity(0.3)
        case .unverified: return color.opacity(0.5)
        default: return color.opacity(0.35)
        }
    }

    /// "Not yet" and "off" carry a dashed border, as on the web, so colour is never the only signal.
    var dashed: Bool { self == .unverified || self == .off }
}

struct StatusBadge: View {
    let label: String
    let tone: Tone

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: tone.symbol).imageScale(.small)
            Text(label).lineLimit(1)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(tone.color)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        // Only "your turn" is tinted, so the one state that asks something of the person stands out.
        .background(tone == .approval ? Palette.approval.opacity(0.08) : Color.clear, in: Capsule())
        .overlay(Capsule().stroke(tone.border, style: StrokeStyle(lineWidth: 1, dash: tone.dashed ? [3, 3] : [])))
        .accessibilityElement(children: .combine)
    }
}

/// Pills, as on the web. At least 50pt tall, so every target is bigger than 44pt.
struct PillButtonStyle: ButtonStyle {
    enum Kind {
        case primary, accent, secondary, danger
    }

    var kind: Kind = .primary
    var compact = false

    func makeBody(configuration: Configuration) -> some View {
        PillBody(configuration: configuration, kind: kind, compact: compact)
    }

    private struct PillBody: View {
        let configuration: ButtonStyleConfiguration
        let kind: Kind
        let compact: Bool
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(.body.weight(.medium))
                .multilineTextAlignment(.center)
                .frame(maxWidth: compact ? nil : .infinity, minHeight: compact ? 44 : 50)
                .padding(.horizontal, 20)
                .foregroundStyle(foreground)
                .background(background, in: Capsule())
                .overlay(Capsule().stroke(kind == .secondary ? Palette.line : Color.clear, lineWidth: 1))
                .opacity(isEnabled ? 1 : 0.5)
                .scaleEffect(configuration.isPressed ? 0.98 : 1)
                .animation(.spring(response: 0.22, dampingFraction: 0.85), value: configuration.isPressed)
        }

        private var foreground: Color {
            switch kind {
            case .primary: return Palette.onPrimary
            case .accent, .danger: return Palette.onAccent
            case .secondary: return Palette.ink
            }
        }

        private var background: Color {
            switch kind {
            case .primary: return Palette.primary
            case .accent: return Palette.accent
            case .danger: return Palette.failed
            case .secondary: return Palette.surface
            }
        }
    }
}

/// The agent made visible: turning while it works, still otherwise and under Reduce Motion.
struct AgentOrb: View {
    var live: Bool
    var size: CGFloat = 44
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var turn = false

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [Palette.accent, Palette.accent.opacity(0.18)], center: .center, startRadius: 0, endRadius: size * 0.24))
                .frame(width: size * 0.46, height: size * 0.46)
            Circle()
                .trim(from: 0, to: 0.7)
                .stroke(Palette.accent.opacity(0.6), style: StrokeStyle(lineWidth: max(1.5, size / 26), lineCap: .round))
                .frame(width: size * 0.78, height: size * 0.78)
                .rotationEffect(.degrees(turn ? 360 : 0))
            Circle()
                .trim(from: 0.1, to: 0.45)
                .stroke(Palette.accent2.opacity(0.55), style: StrokeStyle(lineWidth: max(1, size / 34), lineCap: .round))
                .frame(width: size, height: size)
                .rotationEffect(.degrees(turn ? -360 : 0))
        }
        .frame(width: size, height: size)
        .onAppear {
            guard live, !reduceMotion else { return }
            withAnimation(.linear(duration: 2.6).repeatForever(autoreverses: false)) { turn = true }
        }
        .accessibilityHidden(true)
    }
}

/// How long a change can still be approved (ADR 0042): 72 hours from when it was made.
struct ClosesIn: View {
    let expiresAt: String

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let left = (FarbaekDate.parse(expiresAt) ?? context.date).timeIntervalSince(context.date)
            let closing = left > 0 && left < 12 * 3600
            // A deadline is words with the clock (ADR 0183), as on the web's wallet card; burnt orange once it's closing.
            Label(Self.words(left), systemImage: "clock")
                .font(.footnote)
                .foregroundStyle(closing ? Palette.caution : Palette.ink2)
        }
    }

    /// The web's words, in full: "Closes in 2 days", "Closes in 5 hours", "Closes in 12 minutes", then "Expired".
    /// Rounded down, as on the web, so time left is never overstated.
    static func words(_ seconds: TimeInterval) -> String {
        if seconds <= 0 { return "Expired" }
        let days = Int(seconds / 86_400)
        if days >= 2 { return "Closes in \(days) days" }
        if days == 1 { return "Closes tomorrow" }
        let hours = Int(seconds / 3600)
        if hours >= 1 { return hours == 1 ? "Closes in 1 hour" : "Closes in \(hours) hours" }
        let minutes = max(1, Int(seconds / 60))
        return minutes == 1 ? "Closes in 1 minute" : "Closes in \(minutes) minutes"
    }
}

/// The exact version someone is approving, for whoever wants it. Folded away, as on the web (ADR 0170).
struct TechnicalDetails<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        DisclosureGroup("Technical details") {
            VStack(alignment: .leading, spacing: 6) { content() }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
        }
        .font(.footnote)
        .foregroundStyle(Palette.ink3)
        .tint(Palette.ink3)
    }
}

/// The first twelve characters of a hash, in the monospaced face. Only ever inside Technical details.
struct HashText: View {
    let sha: String

    var body: some View {
        Text(String(sha.prefix(12)))
            .font(.caption.monospaced())
            .foregroundStyle(Palette.ink2)
            .accessibilityLabel("Fingerprint \(String(sha.prefix(12)))")
    }
}

/// The sample kind, graphite on the raised surface, as the web's "Sample" chip.
struct SampleLabel: View {
    var body: some View {
        Label("Sample data", systemImage: Tone.simulated.symbol)
            .font(.caption.weight(.medium))
            .foregroundStyle(Tone.simulated.color)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Palette.surfaceRaised, in: Capsule())
            .overlay(Capsule().stroke(Tone.simulated.border, lineWidth: 1))
            .accessibilityLabel("You're looking at sample data")
    }
}

struct SectionTitle: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.headline.weight(.medium))
            .foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A reason something isn't possible, said plainly. Without a tone it's a plain note in the quiet ink.
struct Notice: View {
    let text: String
    var tone: Tone? = nil
    var symbol = "info.circle"

    var body: some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol)
        }
        .font(.footnote)
        .foregroundStyle(tone?.color ?? Palette.ink2)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// When a time happened, relative to now ("5 min ago"); the exact time for VoiceOver.
struct Ago: View {
    let iso: String

    var body: some View {
        if let date = FarbaekDate.parse(iso) {
            Text(date, format: .relative(presentation: .named))
                .accessibilityLabel(date.formatted(date: .abbreviated, time: .shortened))
        } else {
            Text("")
        }
    }
}

enum Load<T> {
    case loading
    case loaded(T)
    case failed(String)

    var value: T? {
        if case .loaded(let v) = self { return v }
        return nil
    }
}

/// Loading, failure with a way to try again, or the content.
struct LoadView<T, Content: View>: View {
    let load: Load<T>
    let retry: () async -> Void
    @ViewBuilder var content: (T) -> Content

    var body: some View {
        switch load {
        case .loading:
            ProgressView()
                .controlSize(.large)
                .tint(Palette.accent)
                .frame(maxWidth: .infinity, minHeight: 260)
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't load this", systemImage: "exclamationmark.icloud")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") { Task { await retry() } }
                    .buttonStyle(PillButtonStyle(kind: .secondary, compact: true))
            }
            .frame(minHeight: 320)
        case .loaded(let value):
            content(value)
        }
    }
}
