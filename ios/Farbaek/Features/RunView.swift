import SwiftUI

/// The agent at work (ADR 0022): its steps as they happen, its questions
/// (answered with Face ID), a way to message or stop it, and its result.
struct RunView: View {
    let runId: String
    @Environment(AppModel.self) private var model
    @State private var run: RunItem?
    @State private var steps: [RunStep] = []
    @State private var cursor = 0
    @State private var question: RunQuestion?
    @State private var finish: RunFinish?
    @State private var failure: String?
    @State private var loadError: String?
    @State private var message = ""
    @State private var sending = false
    @State private var confirmStop = false
    @State private var askAI = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if model.isSample { SampleLabel() }
                    if let run {
                        header(run)
                        if let question { questionCard(question) }
                        stepsList
                        if let finish { finishCard(finish, run: run) } else if !run.live { outcomeCard(run) }
                        if run.live { controls } else { ReportLink(subject: .task(run.taskId)) }
                    } else if let loadError {
                        ContentUnavailableView {
                            Label("Couldn't load this run", systemImage: "exclamationmark.icloud")
                        } description: {
                            Text(loadError)
                        }
                    } else {
                        ProgressView().tint(Palette.accent).frame(maxWidth: .infinity, minHeight: 260)
                    }
                    if let failure { Notice(text: failure, tone: .failed, symbol: "exclamationmark.triangle.fill") }
                    Color.clear.frame(height: 1).id("end")
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .onChange(of: steps.count) { _, _ in
                if run?.live == true { withAnimation(.easeOut(duration: 0.3)) { proxy.scrollTo("end", anchor: .bottom) } }
            }
        }
        .screenBackground()
        .navigationTitle("Run")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Stop the agent?", isPresented: $confirmStop, titleVisibility: .visible) {
            Button("Stop the run", role: .destructive) { Task { await stop() } }
        } message: {
            Text("It stops after the step it's on. Nothing it hasn't suggested is applied.")
        }
        .task(id: runId) { await follow() }
        .aiConsent(isPresented: $askAI) {
            AIConsent.given = true
            askAI = false
            Task { await send() }
        } onDecline: {
            askAI = false
            failure = "Nothing was sent. Farbaek needs your permission to use AI before the agent can read this."
        }
    }

    private func header(_ run: RunItem) -> some View {
        HStack(alignment: .center, spacing: 16) {
            AgentOrb(live: run.live, size: 56)
            VStack(alignment: .leading, spacing: 6) {
                Text(run.taskTitle).font(.headline.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(3)
                StatusBadge(label: run.statusLabel, tone: Self.tone(run.status))
                Text(Self.summary(run))
                    .font(.footnote)
                    .foregroundStyle(Palette.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .panel()
    }

    /// The web's sentence: "Step 7 of a balanced run on Claude Haiku 5.5." The model arrives by its product name.
    static func summary(_ run: RunItem) -> String {
        let effort = run.effortLabel.lowercased()
        let on = run.model.map { " on \($0)" } ?? ""
        if run.live { return "Step \(run.steps) of a \(effort) run\(on)." }
        return "\(run.steps) \(run.steps == 1 ? "step" : "steps"), a \(effort) run\(on)."
    }

    /// A run that ended without a summary says how it ended, and leads to the task.
    private func outcomeCard(_ run: RunItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("How it ended")
            Text(run.outcome ?? run.statusLabel).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            NavigationLink(value: Destination.task(run.taskId)) {
                Text("Open the task")
            }
            .buttonStyle(PillButtonStyle(kind: .secondary))
        }
        .card()
    }

    private func questionCard(_ q: RunQuestion) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // A waiting state is its words in its colour, with no glyph (ADR 0180); the card's border carries it too.
            Text("The agent is waiting for you")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Palette.approval)
                .accessibilityAddTraits(.isHeader)
            Text(q.display).font(.callout.monospaced()).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            if !q.reason.isEmpty { Text(q.reason).font(.footnote).foregroundStyle(Palette.ink2) }
            if !q.why.isEmpty { Text(q.why).font(.footnote).foregroundStyle(Palette.ink3) }
            if q.canAnswer {
                HStack(spacing: 10) {
                    Button("Decline") { Task { await answer(q, approved: false) } }
                        .buttonStyle(PillButtonStyle(kind: .secondary))
                    Button {
                        Task { await answer(q, approved: true) }
                    } label: {
                        Label("Allow", systemImage: Biometry.symbol)
                    }
                    .buttonStyle(PillButtonStyle(kind: .accent))
                }
                .disabled(sending || model.writeBlocker != nil)
            } else {
                Notice(text: "Only the person who started the run, or an owner or admin, can answer it.", symbol: "lock")
            }
        }
        .card()
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).stroke(Palette.approval.opacity(0.4), lineWidth: 1))
    }

    private var stepsList: some View {
        VStack(alignment: .leading, spacing: 0) {
            if steps.isEmpty {
                Notice(text: "The agent's steps appear here as it works.").padding(12)
            }
            ForEach(steps) { step in
                StepRow(step: step)
                if step.id != steps.last?.id { Divider().overlay(Palette.line).padding(.leading, 44) }
            }
        }
        .card(padding: 4)
    }

    private func finishCard(_ finish: RunFinish, run: RunItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("What the agent did")
            Text(finish.summary).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            ForEach(finish.risks, id: \.self) { risk in
                Label(risk, systemImage: "exclamationmark.triangle").font(.footnote).foregroundStyle(Palette.approval)
            }
            if run.proposalId != nil {
                NavigationLink(value: Destination.approval(run.taskId)) {
                    Label("Review the change", systemImage: "checkmark.seal")
                }
                .buttonStyle(PillButtonStyle(kind: .accent))
            }
            NavigationLink(value: Destination.task(run.taskId)) {
                Text("Open the task")
            }
            .buttonStyle(PillButtonStyle(kind: .secondary))
        }
        .card()
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TextField("Message the agent", text: $message, axis: .vertical)
                    .font(.body)
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .frame(minHeight: 44)
                    .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.input, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.input, style: .continuous).stroke(Palette.lineStrong.opacity(0.5), lineWidth: 1))
                Button {
                    if AIConsent.given {
                        Task { await send() }
                    } else {
                        askAI = true
                    }
                } label: {
                    Image(systemName: "arrow.up").font(.body.weight(.semibold)).frame(width: 44, height: 44)
                }
                .buttonStyle(PillButtonStyle(kind: .primary, compact: true))
                .accessibilityLabel("Send")
                .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || sending || model.writeBlocker != nil)
            }
            Text("The agent reads it at its next step.").font(.footnote).foregroundStyle(Palette.ink3)
            Button("Stop the run") { confirmStop = true }
                .buttonStyle(PillButtonStyle(kind: .secondary))
                .disabled(model.writeBlocker != nil)
        }
    }

    static func tone(_ status: String) -> Tone {
        switch status {
        case "finished": return .verified
        case "waiting": return .approval
        case "failed", "interrupted": return .failed
        case "cancelled": return .unverified
        default: return .info
        }
    }

    /// Reads new steps every two seconds while the run is live, then once more for its result.
    private func follow() async {
        while !Task.isCancelled {
            await readMore()
            if let run, !run.live { break }
            try? await Task.sleep(for: .seconds(2))
        }
    }

    private func readMore() async {
        do {
            let detail: RunDetail = try await model.api.get("runs/\(runId)", query: [URLQueryItem(name: "after", value: String(cursor))])
            run = detail.run
            if !detail.steps.isEmpty {
                withAnimation(.easeOut(duration: 0.26)) { steps.append(contentsOf: detail.steps) }
            }
            cursor = detail.cursor
            question = detail.question
            finish = detail.finish
            loadError = nil
            if !detail.run.live { model.changed() }
        } catch {
            if run == nil { loadError = error.localizedDescription }
        }
    }

    private func answer(_ q: RunQuestion, approved: Bool) async {
        failure = nil
        if approved {
            guard await OwnerCheck.confirm("Allow the agent to run this") else {
                failure = "Not allowed: Face ID or the passcode didn't confirm it was you."
                return
            }
        }
        sending = true
        defer { sending = false }
        do {
            _ = try await model.api.send("POST", "runs/\(runId)/answer", body: ["requestId": q.requestId, "approved": approved, "bindingHash": q.bindingHash], as: Nothing?.self)
            question = nil
        } catch {
            failure = error.localizedDescription
        }
    }

    private func send() async {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending else { return }
        failure = nil
        sending = true
        defer { sending = false }
        do {
            _ = try await model.api.send("POST", "runs/\(runId)/message", body: ["text": text], as: Nothing?.self)
            message = ""
        } catch {
            failure = error.localizedDescription
        }
    }

    private func stop() async {
        failure = nil
        do {
            _ = try await model.api.send("POST", "runs/\(runId)/stop", as: Nothing?.self)
        } catch {
            failure = error.localizedDescription
        }
    }
}

struct StepRow: View {
    let step: RunStep

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.footnote)
                .foregroundStyle(step.exitCode.map { $0 == 0 ? Palette.verified : Palette.failed } ?? Palette.accent)
                .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(step.title.isEmpty ? label : step.title)
                    .font(step.kind == "command" ? Font.footnote.monospaced() : Font.subheadline)
                    .foregroundStyle(Palette.ink)
                    .lineLimit(3)
                if !step.detail.isEmpty {
                    Text(step.detail)
                        .font(step.kind == "command" ? Font.caption.monospaced() : Font.footnote)
                        .foregroundStyle(Palette.ink2)
                        .lineLimit(5)
                }
                if let code = step.exitCode {
                    // The web's words: the exit code only where it explains a failure.
                    Text(code == 0 ? "Passed" : "Failed (exit \(code))")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(code == 0 ? Palette.verified : Palette.failed)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .accessibilityElement(children: .combine)
    }

    private var symbol: String {
        switch step.kind {
        case "model": return "ellipsis.bubble"
        case "tool": return "wrench.and.screwdriver"
        case "command": return "terminal"
        case "approval": return "hand.raised"
        default: return "text.bubble"
        }
    }

    private var label: String {
        switch step.kind {
        case "model": return "Thinking"
        case "tool": return "Working on files"
        case "command": return "Running a command"
        case "approval": return "Asked for your approval"
        default: return "Note"
        }
    }
}
