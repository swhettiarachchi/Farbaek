import SwiftUI

/// Changes waiting for a person, soonest to close first (ADR 0042).
struct ApprovalsView: View {
    @Environment(AppModel.self) private var model
    @State private var load: Load<Approvals> = .loading

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if model.isSample { SampleLabel() }
                LoadView(load: load, retry: read) { approvals in
                    if approvals.items.isEmpty {
                        ContentUnavailableView {
                            Label("Nothing waits for you", systemImage: "checkmark.seal")
                        } description: {
                            Text("Changes appear here when the agent suggests one under an approved plan.")
                        }
                        .frame(minHeight: 360)
                    } else {
                        VStack(spacing: 12) {
                            ForEach(approvals.items) { card in
                                NavigationLink(value: Destination.approval(card.taskId)) {
                                    WalletCardView(card: card)
                                }
                                .buttonStyle(.plain)
                            }
                            if approvals.more > 0 {
                                Notice(text: "\(approvals.more) more wait after these. Approve or discard some to see them.")
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .screenBackground()
        .navigationTitle("Approvals")
        .refreshable { await read() }
        .task(id: model.revision) { await read() }
    }

    private func read() async {
        do {
            let approvals: Approvals = try await model.api.get("approvals")
            model.waiting = approvals.decidable.map { $0 + approvals.more } ?? (approvals.items.count + approvals.more)
            withAnimation(.easeOut(duration: 0.26)) { load = .loaded(approvals) }
        } catch {
            if load.value == nil { load = .failed(error.localizedDescription) }
        }
    }
}

struct WalletCardView: View {
    let card: ApprovalCard

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(card.title).font(.body.weight(.medium)).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
                    Text(card.projectName).font(.footnote).foregroundStyle(Palette.ink2)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Palette.ink3)
            }
            FlowFacts(facts: card.facts)
            HStack(spacing: 12) {
                ClosesIn(expiresAt: card.expiresAt)
                Spacer()
                Label(card.byAgent ? "Desktop agent" : "In Farbaek", systemImage: card.byAgent ? "desktopcomputer" : "cloud")
                    .font(.footnote)
                    .foregroundStyle(Palette.ink3)
            }
            if !card.canApprove {
                Notice(text: "Escalated: an owner or admin approves this one.", tone: .approval, symbol: "person.badge.shield.checkmark")
            }
        }
        .card()
        .contentShape(Rectangle())
    }
}

struct FlowFacts: View {
    let facts: [WalletFact]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(facts, id: \.self) { fact in
                Label(fact.label, systemImage: Self.symbol(fact.kind))
                    .font(.footnote)
                    .foregroundStyle(Tone(fact.tone).color)
            }
        }
    }

    static func symbol(_ kind: String) -> String {
        switch kind {
        case "escalated": return "person.badge.shield.checkmark"
        case "flagged": return "flag.fill"
        case "unexplained": return "questionmark.circle"
        case "matched": return "text.badge.checkmark"
        default: return "doc.on.doc"
        }
    }
}

/// One change in full: the plan, every file as a diff, what the policy found
/// and the checks that will run. Approving needs Face ID or the passcode, and
/// applies exactly the content shown, bound to its hash.
struct ApprovalDetailView: View {
    let taskId: String
    @Environment(AppModel.self) private var model
    @State private var load: Load<ApprovalDetail> = .loading
    @State private var working = false
    @State private var failure: String?
    @State private var outcome: String?
    @State private var confirmDiscard = false

    var body: some View {
        ScrollView {
            LoadView(load: load, retry: read) { detail in
                VStack(alignment: .leading, spacing: 18) {
                    summary(detail)
                    if !detail.proposal.risks.isEmpty || detail.proposal.policy != nil { checksAndPolicy(detail.proposal) }
                    files(detail.proposal)
                    if let outcome {
                        Notice(text: outcome, tone: .verified, symbol: "checkmark.circle.fill").card()
                    }
                    ReportLink(subject: .task(taskId))
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 140)
            }
        }
        .screenBackground()
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if let detail = load.value, outcome == nil { actions(detail) }
        }
        .confirmationDialog("Discard this change?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard the change", role: .destructive) { Task { await discard() } }
        } message: {
            Text("Nothing is applied. The agent can suggest another under the same plan.")
        }
        .refreshable { await read() }
        .task { await read() }
        .sensoryFeedback(.success, trigger: outcome)
    }

    private func summary(_ detail: ApprovalDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if model.isSample { SampleLabel() }
            Text(detail.task.title)
                .font(.title2.weight(.medium))
                .tracking(-0.4)
                .foregroundStyle(Palette.ink)
            HStack(spacing: 8) {
                StatusBadge(label: detail.task.stateLabel, tone: Tone(detail.task.tone))
                ClosesIn(expiresAt: detail.proposal.expiresAt)
            }
            Text(detail.proposal.summary)
                .font(.body)
                .foregroundStyle(Palette.ink2)
                .fixedSize(horizontal: false, vertical: true)
            if !detail.proposal.steps.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(detail.proposal.steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("\(index + 1)").font(.footnote.monospacedDigit()).foregroundStyle(Palette.ink3).frame(width: 18, alignment: .trailing)
                            Text(step).font(.subheadline).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            TechnicalDetails {
                HStack(spacing: 6) {
                    Text("Fingerprint")
                    HashText(sha: detail.proposal.sha256)
                }
                if let modelName = detail.proposal.model {
                    Text(modelName).font(.caption.monospaced()).lineLimit(1)
                }
            }
        }
        .panel()
    }

    private func checksAndPolicy(_ proposal: ProposalDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle("Before you approve")
            if let policy = proposal.policy {
                Label("Rules: \(Self.policyWords(policy.outcome))", systemImage: policy.outcome == "ESCALATE" ? "person.badge.shield.checkmark" : "shield.lefthalf.filled")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(policy.outcome == "ESCALATE" ? Palette.approval : Palette.ink)
                ForEach(policy.findings, id: \.self) { finding in
                    Text(finding.detail).font(.footnote).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true)
                }
            }
            ForEach(proposal.risks, id: \.self) { risk in
                Label(risk, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(Palette.approval)
            }
            if !proposal.checks.isEmpty {
                Text("Checks that run after you approve").font(.footnote.weight(.medium)).foregroundStyle(Palette.ink)
                ForEach(proposal.checks, id: \.self) { check in
                    Text(check).font(.caption.monospaced()).foregroundStyle(Palette.ink2)
                }
            }
            if let note = proposal.checksNote { Notice(text: note) }
        }
        .card()
    }

    private func files(_ proposal: ProposalDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(proposal.files.count == 1 ? "1 file" : "\(proposal.files.count) files")
            ForEach(proposal.files) { file in
                FileDiffCard(file: file)
            }
            ForEach(proposal.dropped, id: \.self) { dropped in
                Notice(text: "Left out \(dropped.path): \(dropped.reason)", symbol: "minus.circle")
            }
        }
    }

    @ViewBuilder private func actions(_ detail: ApprovalDetail) -> some View {
        VStack(spacing: 10) {
            if let failure { Notice(text: failure, tone: .failed, symbol: "exclamationmark.triangle.fill") }
            if detail.canApprove {
                Button {
                    Task { await approve(detail) }
                } label: {
                    if working { ProgressView().tint(Palette.onAccent) } else { Label("Approve with Face ID", systemImage: "faceid") }
                }
                .buttonStyle(PillButtonStyle(kind: .accent))
                .disabled(working)
            } else if let reason = detail.approveReason {
                Notice(text: reason, symbol: "lock")
            }
            if detail.canDiscard {
                Button("Discard") { confirmDiscard = true }
                    .buttonStyle(PillButtonStyle(kind: .secondary))
                    .disabled(working)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.bar)
    }

    static func policyWords(_ outcome: String) -> String {
        switch outcome {
        case "ALLOW_WITHIN_LIMITS": return "within the workspace's limits"
        case "REQUIRE_APPROVAL": return "needs a person"
        case "ESCALATE": return "needs an owner or admin"
        case "BLOCK": return "blocked"
        default: return outcome.lowercased().replacingOccurrences(of: "_", with: " ")
        }
    }

    private func read() async {
        do {
            let detail: ApprovalDetail = try await model.api.get("approvals/\(taskId)")
            load = .loaded(detail)
        } catch {
            if load.value == nil { load = .failed(error.localizedDescription) }
        }
    }

    private func approve(_ detail: ApprovalDetail) async {
        failure = nil
        guard await OwnerCheck.confirm("Approve \(detail.task.title)") else {
            failure = "Not approved: Face ID or the passcode didn't confirm it was you."
            return
        }
        working = true
        defer { working = false }
        do {
            let applied: Applied = try await model.api.send("POST", "approvals/\(taskId)/approve", body: ["proposalId": detail.proposal.id, "sha256": detail.proposal.sha256])
            let files = applied.written == 1 ? "1 file" : "\(applied.written) files"
            outcome = applied.checking ? "Approved and applied \(files). The checks have started; you'll be told how they end." : "Approved and applied \(files). Open the task to run its checks."
            model.changed()
        } catch {
            failure = error.localizedDescription
        }
    }

    private func discard() async {
        guard let detail = load.value else { return }
        failure = nil
        working = true
        defer { working = false }
        do {
            _ = try await model.api.send("POST", "approvals/\(taskId)/discard", body: ["proposalId": detail.proposal.id], as: Nothing?.self)
            outcome = "Discarded. Nothing was applied."
            model.changed()
        } catch {
            failure = error.localizedDescription
        }
    }
}

/// A file's change as numbered lines: added and removed marked by sign as well as colour.
struct FileDiffCard: View {
    let file: FileChange
    @State private var open = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeOut(duration: 0.2)) { open.toggle() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: file.kind == "create" ? "doc.badge.plus" : "doc.text").foregroundStyle(Palette.ink2)
                    Text(file.path).font(.footnote.monospaced()).foregroundStyle(Palette.ink).lineLimit(2).multilineTextAlignment(.leading)
                    Spacer(minLength: 6)
                    Text("+\(file.added)").font(.caption.monospacedDigit()).foregroundStyle(Palette.verified)
                    Text("-\(file.removed)").font(.caption.monospacedDigit()).foregroundStyle(Palette.failed)
                    Image(systemName: "chevron.down").font(.caption).foregroundStyle(Palette.ink3).rotationEffect(.degrees(open ? 0 : -90))
                }
                .padding(12)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(file.path), \(file.added) lines added, \(file.removed) removed")

            if open {
                if !file.reason.isEmpty {
                    Text(file.reason).font(.footnote).foregroundStyle(Palette.ink2).padding(.horizontal, 12).padding(.bottom, 8)
                }
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(file.hunks.enumerated()), id: \.offset) { index, hunk in
                        if index > 0 {
                            Text("...").font(.caption.monospaced()).foregroundStyle(Palette.ink3).padding(.vertical, 2).padding(.leading, 52)
                        }
                        ForEach(Array(hunk.lines.enumerated()), id: \.offset) { _, line in
                            DiffLineRow(line: line)
                        }
                    }
                    if file.truncated {
                        Notice(text: "The rest of this file is long. Read it in full on the web.", symbol: "ellipsis.rectangle")
                            .padding(12)
                    }
                }
                .padding(.vertical, 6)
                .background(Palette.canvas2)
            }
        }
        .background(Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).stroke(Palette.line, lineWidth: 1))
    }
}

struct DiffLineRow: View {
    let line: DiffLine

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(number).foregroundStyle(Palette.ink3).frame(width: 34, alignment: .trailing)
            Text(sign).foregroundStyle(signColor).frame(width: 10)
            Text(line.text.isEmpty ? " " : line.text)
                .foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.caption2.monospaced())
        .padding(.vertical, 1.5)
        .padding(.horizontal, 6)
        .background(background)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(spoken)
    }

    private var number: String {
        if let n = line.new ?? line.old { return String(n) }
        return ""
    }

    private var sign: String {
        switch line.kind {
        case "add": return "+"
        case "del": return "-"
        default: return " "
        }
    }

    private var signColor: Color {
        line.kind == "add" ? Palette.verified : line.kind == "del" ? Palette.failed : Palette.ink3
    }

    private var background: Color {
        line.kind == "add" ? Palette.verified.opacity(0.08) : line.kind == "del" ? Palette.failed.opacity(0.08) : Color.clear
    }

    private var spoken: String {
        let what = line.kind == "add" ? "Added" : line.kind == "del" ? "Removed" : "Unchanged"
        return "\(what), line \(number): \(line.text)"
    }
}
