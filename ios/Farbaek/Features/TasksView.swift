import SwiftUI

enum TaskFilter: String, CaseIterable, Identifiable {
    case all, waiting, active, done, stopped

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: return "All"
        case .waiting: return "Waiting"
        case .active: return "Active"
        case .done: return "Done"
        case .stopped: return "Stopped"
        }
    }
}

struct TasksView: View {
    @Environment(AppModel.self) private var model
    @State private var filter: TaskFilter = .all
    @State private var load: Load<[TaskItem]> = .loading

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if model.isSample { SampleLabel() }
                Picker("Show", selection: $filter) {
                    ForEach(TaskFilter.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                LoadView(load: load, retry: read) { tasks in
                    if tasks.isEmpty {
                        ContentUnavailableView {
                            Label("No tasks here", systemImage: "list.bullet.rectangle")
                        } description: {
                            Text(filter == .all ? "Describe something to build and its task appears here." : "No tasks are \(filter.title.lowercased()) right now.")
                        }
                        .frame(minHeight: 300)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(tasks) { task in
                                NavigationLink(value: Destination.task(task.id)) {
                                    TaskRow(task: task)
                                }
                                .buttonStyle(.plain)
                                if task.id != tasks.last?.id { Divider().overlay(Palette.line) }
                            }
                        }
                        .card(padding: 4)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .screenBackground()
        .navigationTitle("Tasks")
        .refreshable { await read() }
        .task(id: "\(filter.rawValue)-\(model.revision)") { await read() }
    }

    private func read() async {
        do {
            let list: Listing<TaskItem> = try await model.api.get("tasks", query: [URLQueryItem(name: "filter", value: filter.rawValue)])
            withAnimation(.easeOut(duration: 0.2)) { load = .loaded(list.items) }
        } catch {
            load = .failed(error.localizedDescription)
        }
    }
}

/// The next step on a task, first thing on its page (ADR 0173), in the web's own words. Its tone has its
/// own symbol and word, so status never relies on colour alone.
struct NextStepCard: View {
    let step: NextStep
    let detail: TaskDetail
    @Environment(AppModel.self) private var model

    private var word: String {
        switch step.tone {
        case "action": return "Your turn"
        case "working": return "In progress"
        case "done": return "Done"
        case "problem": return "Needs attention"
        default: return "For your information"
        }
    }

    private var symbol: String {
        switch step.tone {
        case "action": return "pencil.line"
        case "working": return "hammer"
        case "done": return "checkmark.seal.fill"
        case "problem": return "exclamationmark.triangle.fill"
        default: return "info.circle"
        }
    }

    private var color: Color {
        switch step.tone {
        case "action": return Palette.accent
        case "working": return Palette.info
        case "done": return Palette.verified
        case "problem": return Palette.failed
        default: return Palette.ink2
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(word, systemImage: symbol)
                .font(.footnote.weight(.medium))
                .foregroundStyle(color)
            Text(step.title)
                .font(.title3.weight(.medium))
                .tracking(-0.3)
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(step.body)
                .font(.subheadline)
                .foregroundStyle(Palette.ink2)
                .fixedSize(horizontal: false, vertical: true)
            if let action = step.action { button(action) }
        }
        .panel()
    }

    @ViewBuilder private func button(_ action: NextStep.Action) -> some View {
        switch action.target {
        case "plan":
            NavigationLink(value: Destination.plan(detail.task.id)) { Text(action.label) }
                .buttonStyle(PillButtonStyle(kind: .accent))
        case "change":
            NavigationLink(value: Destination.approval(detail.task.id)) { Text(action.label) }
                .buttonStyle(PillButtonStyle(kind: .accent))
        case "project":
            NavigationLink(value: Destination.project(detail.task.projectId)) { Text(action.label) }
                .buttonStyle(PillButtonStyle(kind: .secondary))
        case "run":
            if let live = detail.runs.first(where: { $0.live }) {
                NavigationLink(value: Destination.run(live.id)) { Text(action.label) }
                    .buttonStyle(PillButtonStyle(kind: step.tone == "action" ? .accent : .secondary))
            } else {
                // It ended between the two reads: the web always has the task. Never a card with no way on.
                onTheWeb(action)
            }
        default:
            onTheWeb(action)
        }
    }

    /// A sample's task doesn't exist on the web, so the sample says where this step would be.
    @ViewBuilder private func onTheWeb(_ action: NextStep.Action) -> some View {
        if model.isSample {
            Notice(text: "With your own project, this step opens on the web.", symbol: "safari")
        } else {
            WebLink(path: "app/tasks/\(detail.task.id)") {
                Label(action.label, systemImage: "safari")
            }
            .buttonStyle(PillButtonStyle(kind: .secondary))
        }
    }
}

/// A task's story: its next step, its progress, the change and its proof, its runs and every transition.
struct TaskDetailView: View {
    let taskId: String
    @Environment(AppModel.self) private var model
    @State private var load: Load<TaskDetail> = .loading

    var body: some View {
        ScrollView {
            LoadView(load: load, retry: read) { detail in
                VStack(alignment: .leading, spacing: 16) {
                    if model.isSample { SampleLabel() }
                    VStack(alignment: .leading, spacing: 10) {
                        Text(detail.task.title).font(.title2.weight(.medium)).tracking(-0.4).foregroundStyle(Palette.ink)
                        Text(detail.task.projectName).font(.subheadline).foregroundStyle(Palette.ink2)
                        StatusBadge(label: detail.task.stateLabel, tone: Tone(detail.task.tone))
                    }

                    if let step = detail.nextStep { NextStepCard(step: step, detail: detail) }

                    lifecycle(detail.stages)
                    if !detail.proofs.isEmpty || detail.verification != nil { evidence(detail) }
                    if !detail.runs.isEmpty { runs(detail.runs) }
                    history(detail.history)
                    if !model.isSample {
                        WebLink(path: "app/tasks/\(taskId)") {
                            Label("Open on the web", systemImage: "safari")
                                .frame(minHeight: 44, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .font(.subheadline.weight(.medium))
                    }
                    ReportLink(subject: .task(taskId))
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .screenBackground()
        .navigationTitle("Task")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await read() }
        .task(id: model.revision) { await read() }
    }

    private func lifecycle(_ stages: [LifecycleStage]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Progress")
            ForEach(stages, id: \.self) { stage in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: Tone(stage.status).symbol)
                        .foregroundStyle(Tone(stage.status).color)
                        .frame(width: 22)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(stage.label).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                        if !stage.note.isEmpty { Text(stage.note).font(.footnote).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true) }
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .card()
    }

    private func evidence(_ detail: TaskDetail) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Proof")
            if let v = detail.verification {
                let result = v.result ?? (v.status == "running" ? "running" : v.status)
                Label {
                    Text(Self.verificationWords(result, failure: v.failure)).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    if result == "running" {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: Tone(Self.tone(result)).symbol)
                    }
                }
                .font(.subheadline)
                .foregroundStyle(result == "running" ? Palette.info : Tone(Self.tone(result)).color)
            }
            ForEach(detail.proofs, id: \.self) { proof in
                HStack(spacing: 10) {
                    Image(systemName: "seal").foregroundStyle(Palette.seal)
                    Text("ProofPack").font(.subheadline).foregroundStyle(Palette.ink)
                    Spacer()
                    StatusBadge(label: Self.proofWords(proof.status), tone: Tone(Self.tone(proof.status)))
                }
            }
        }
        .card()
    }

    private func runs(_ runs: [RunItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle("Runs")
            ForEach(runs) { run in
                NavigationLink(value: Destination.run(run.id)) {
                    HStack(spacing: 12) {
                        AgentOrb(live: run.live, size: 30)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(run.steps) steps, \(run.effortLabel)").font(.subheadline).foregroundStyle(Palette.ink)
                            Ago(iso: run.startedAt).font(.footnote).foregroundStyle(Palette.ink3)
                        }
                        Spacer()
                        StatusBadge(label: run.statusLabel, tone: RunView.tone(run.status))
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .card()
    }

    private func history(_ items: [HistoryItem]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionTitle("History")
            ForEach(items.reversed()) { item in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Circle().fill(Palette.lineStrong).frame(width: 6, height: 6)
                    Text(item.toLabel).font(.subheadline).foregroundStyle(Palette.ink)
                    Text(Self.actorWords(item.actor)).font(.footnote).foregroundStyle(Palette.ink3)
                    Spacer()
                    Ago(iso: item.at).font(.footnote).foregroundStyle(Palette.ink3)
                }
            }
        }
        .card()
    }

    static func tone(_ status: String) -> String {
        switch status {
        case "verified": return "verified"
        case "partially_verified", "unverified": return "unverified"
        case "failed": return "failed"
        default: return "neutral"
        }
    }

    static func proofWords(_ status: String) -> String {
        switch status {
        case "verified": return "Verified"
        case "partially_verified": return "Partly verified"
        case "failed": return "Failed"
        default: return "Not verified yet"
        }
    }

    static func verificationWords(_ result: String, failure: String?) -> String {
        switch result {
        case "running": return "The checks are running."
        case "verified": return "Every check passed."
        case "partially_verified": return "Some checks passed; the rest couldn't run."
        case "failed": return failure.map { "The checks failed: \($0)" } ?? "The checks failed."
        default: return "The checks haven't run yet."
        }
    }

    static func actorWords(_ actor: String) -> String {
        switch actor {
        case "user": return "by a person"
        case "agent": return "by the agent"
        default: return "by Farbaek"
        }
    }

    private func read() async {
        do {
            let detail: TaskDetail = try await model.api.get("tasks/\(taskId)")
            load = .loaded(detail)
        } catch {
            if load.value == nil { load = .failed(error.localizedDescription) }
        }
    }
}
