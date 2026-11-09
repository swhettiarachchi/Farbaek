import SwiftUI

/// What waits for you, what the agent is doing now, and what happened lately.
struct TodayView: View {
    @Environment(AppModel.self) private var model
    @State private var load: Load<Home> = .loading
    /// The waiting count grows with the reader's text size, like the rest of the screen.
    @ScaledMetric(relativeTo: .largeTitle) private var countSize: CGFloat = 44

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                if needsWorkspace {
                    firstWorkspace
                } else {
                    LoadView(load: load, retry: read) { home in
                        VStack(alignment: .leading, spacing: 20) {
                            waitingPanel(home)
                            if !home.live.isEmpty { liveRuns(home.live) }
                            recent(home.recent)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .screenBackground()
        .navigationTitle("Home")
        .toolbar { WorkspaceMenu(model: model) }
        .refreshable { await read() }
        .task(id: model.revision) { await read() }
    }

    /// Signed in with no workspace yet, as after a first Sign in with Apple.
    private var needsWorkspace: Bool {
        model.phase == .signedIn && model.me != nil && model.currentWorkspace == nil
    }

    private var firstWorkspace: some View {
        VStack(alignment: .leading, spacing: 14) {
            AgentOrb(live: false, size: 40)
            Text("Make your workspace")
                .font(.title2.weight(.medium))
                .tracking(-0.5)
                .foregroundStyle(Palette.ink)
            Text("Your projects, plans and approvals live in a workspace. Farbaek makes one called My workspace. You can rename it and invite people on the web.")
                .font(.subheadline)
                .foregroundStyle(Palette.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await model.createWorkspace() }
            } label: {
                if model.creatingWorkspace {
                    ProgressView().tint(Palette.onPrimary)
                } else {
                    Text("Make my workspace")
                }
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
            .disabled(model.creatingWorkspace)
            if let error = model.workspaceError {
                Notice(text: error, tone: .failed, symbol: "exclamationmark.circle.fill")
            }
        }
        .panel()
    }

    @ViewBuilder private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            if model.isSample { SampleLabel() }
            if let workspace = model.currentWorkspace {
                Text(workspace.planSentence)
                    .font(.subheadline)
                    .foregroundStyle(Palette.ink2)
                // The web Home's AI usage meter, as one sentence, so a used-up allowance is never first seen as a refusal.
                // Nothing used yet is nothing to say (ADR 0180): the line appears from 1%.
                if !needsWorkspace, let usage = load.value?.usage, let percent = usage.percent, percent >= 1 {
                    Text(Self.usageSentence(percent: percent, period: usage.period, endsAt: usage.endsAt))
                        .font(.subheadline)
                        .foregroundStyle(percent >= 100 ? Palette.failed : percent >= 80 ? Palette.caution : Palette.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let paused = workspace.paused {
                    Notice(text: "Farbaek has paused this workspace: \(paused)", tone: .failed, symbol: "pause.circle.fill")
                } else if workspace.agentsPaused {
                    Notice(text: "Agents are paused in this workspace. An owner or admin resumes them on the web.", tone: .paused, symbol: Tone.paused.symbol)
                }
            }
        }
    }

    private func waitingPanel(_ home: Home) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            // A number only when there is something to count (ADR 0180); "0" is a counter with nothing behind it.
            if home.waiting > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    // Your turn is the brand's blue (ADR 0183).
                    Text("\(home.waiting)")
                        .font(.system(size: countSize, weight: .medium))
                        .tracking(-1)
                        .foregroundStyle(Palette.accent)
                        .contentTransition(.numericText())
                    Text(home.waiting == 1 ? "change waits for you" : "changes wait for you")
                        .font(.headline.weight(.regular))
                        .foregroundStyle(Palette.ink2)
                }
            } else {
                // Nothing is anyone's turn, so the heading says so rather than "Your turn".
                Text("Nothing waits for you")
                    .font(.headline.weight(.medium))
                    .foregroundStyle(Palette.ink)
            }
            Text(home.waiting > 0 ? "Each one can be approved for 72 hours, only as the exact content you review." : "New changes appear here when the agent suggests one.")
                .font(.subheadline)
                .foregroundStyle(Palette.ink2)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                if home.waiting > 0 {
                    Button("Review") { model.tab = .approvals }
                        .buttonStyle(PillButtonStyle(kind: .accent, compact: true))
                }
                Button("Build something") { model.tab = .build }
                    .buttonStyle(PillButtonStyle(kind: .secondary, compact: true))
            }
        }
        .panel()
    }

    private func liveRuns(_ runs: [RunItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("The agent at work", symbol: "hammer")
            ForEach(runs) { run in
                NavigationLink(value: Destination.run(run.id)) {
                    HStack(spacing: 14) {
                        AgentOrb(live: true, size: 40)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(run.taskTitle).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                            Text("\(run.projectName), \(run.steps == 1 ? "1 step" : "\(run.steps) steps") so far").font(.footnote).foregroundStyle(Palette.ink2)
                        }
                        Spacer(minLength: 8)
                        StatusBadge(label: run.statusLabel, tone: RunView.tone(run.status))
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func recent(_ tasks: [TaskItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionTitle("Recent", symbol: "list.bullet")
                NavigationLink(value: Destination.tasks) {
                    Text("All tasks")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Palette.accent)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .fixedSize()
            }
            if tasks.isEmpty {
                Notice(text: "No tasks yet. Describe something to build and it starts here.")
                    .card()
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

    /// "Used 2% of this month's AI usage." Near the end, when it resets too, as the web says it.
    static func usageSentence(percent: Double, period: String, endsAt: String?) -> String {
        let whose = period == "trial" ? "the trial's" : "this month's"
        let used = Int(percent.rounded())
        var sentence = used >= 100 ? "You've used all of \(whose) AI usage." : "Used \(used)% of \(whose) AI usage."
        if used >= 80, let endsAt, let end = FarbaekDate.parse(endsAt) {
            let day = end.formatted(.dateTime.month(.abbreviated).day())
            sentence += period == "trial" ? " It ends with the trial on \(day)." : " It resets on \(day)."
        }
        return sentence
    }

    private func read() async {
        // The account may not have loaded (offline at launch). Home is where people pull to refresh, so it loads it here too.
        if model.me == nil, model.phase == .signedIn { await model.loadMe(as: .signedIn) }
        guard !needsWorkspace else { return }
        do {
            let home: Home = try await model.api.get("home")
            model.waiting = home.waiting
            withAnimation(.easeOut(duration: 0.26)) { load = .loaded(home) }
        } catch {
            if load.value == nil { load = .failed(error.localizedDescription) }
        }
    }
}

struct TaskRow: View {
    let task: TaskItem

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title).font(.body).foregroundStyle(Palette.ink).lineLimit(2)
                HStack(spacing: 4) {
                    Text(task.projectName)
                    Text("·")
                    Ago(iso: task.updatedAt)
                }
                .font(.footnote)
                .foregroundStyle(Palette.ink3)
            }
            Spacer(minLength: 8)
            StatusBadge(label: task.stateLabel, tone: Tone(taskState: task.state, tone: task.tone))
            Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Palette.ink3).accessibilityHidden(true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

/// Switches between the person's workspaces.
struct WorkspaceMenu: ToolbarContent {
    let model: AppModel

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            if let me = model.me, me.workspaces.count > 1 {
                Menu {
                    ForEach(me.workspaces) { workspace in
                        Button {
                            model.selectWorkspace(workspace.id)
                        } label: {
                            if workspace.id == model.currentWorkspace?.id {
                                Label(workspace.name, systemImage: "checkmark")
                            } else {
                                Text(workspace.name)
                            }
                        }
                    }
                } label: {
                    Label("Workspace", systemImage: "square.stack.3d.up")
                }
                .accessibilityLabel("Switch workspace")
            }
        }
    }
}
