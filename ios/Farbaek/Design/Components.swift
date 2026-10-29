import SwiftUI

// White Signal on iPhone (ADR 0008, ADR 0110): the web's colours (Tokens.swift),
// its shapes (pill buttons, 12pt inputs, 20pt cards, 28pt panels) and its rule
// that status never relies on colour alone. Text is Apple's system font; codes,
// hashes and paths are its monospaced face.

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
            .shadow(color: Palette.accent.opacity(0.10), radius: 16, x: 0, y: 10)
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

/// A state's words, icon and colour together.
enum Tone: String {
    case verified, approval, failed, unverified, info, neutral

    init(_ raw: String) {
        self = Tone(rawValue: raw) ?? .neutral
    }

    var color: Color {
        switch self {
        case .verified: return Palette.verified
        case .approval: return Palette.approval
        case .failed: return Palette.failed
        case .unverified: return Palette.unverified
        case .info: return Palette.info
        case .neutral: return Palette.ink2
        }
    }

    var symbol: String {
        switch self {
        case .verified: return "checkmark.seal.fill"
        case .approval: return "hand.raised.fill"
        case .failed: return "xmark.octagon.fill"
        case .unverified: return "circle.dashed"
        case .info: return "circle.inset.filled"
        case .neutral: return "circle"
        }
    }
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
        .background(tone.color.opacity(0.08), in: Capsule())
        .overlay(Capsule().stroke(tone.color.opacity(0.28), lineWidth: 1))
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
            let closing = left < 12 * 3600
            Label(Self.words(left), systemImage: closing ? "hourglass.bottomhalf.filled" : "hourglass")
                .font(.footnote)
                .foregroundStyle(closing ? Palette.approval : Palette.ink2)
        }
    }

    static func words(_ seconds: TimeInterval) -> String {
        if seconds <= 0 { return "Closed" }
        let hours = Int(seconds / 3600)
        if hours >= 1 { return "Closes in \(hours) h" }
        return "Closes in \(max(1, Int(seconds / 60))) min"
    }
}

/// The first twelve characters of a hash, in the monospaced face.
struct HashText: View {
    let sha: String

    var body: some View {
        Text(String(sha.prefix(12)))
            .font(.caption.monospaced())
            .foregroundStyle(Palette.ink2)
            .accessibilityLabel("Hash \(String(sha.prefix(12)))")
    }
}

struct SampleLabel: View {
    var body: some View {
        Label("Sample data", systemImage: "eye")
            .font(.caption.weight(.medium))
            .foregroundStyle(Palette.ink2)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Palette.surfaceRaised, in: Capsule())
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

/// A reason something isn't possible, said plainly.
struct Notice: View {
    let text: String
    var tone: Tone = .neutral
    var symbol = "info.circle"

    var body: some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol)
        }
        .font(.footnote)
        .foregroundStyle(tone == .neutral ? Palette.ink2 : tone.color)
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
