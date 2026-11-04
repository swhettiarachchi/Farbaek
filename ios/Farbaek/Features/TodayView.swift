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
        .navigationTitle("Today")
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
                Notice(text: error, tone: .failed, symbol: "exclamationmark.triangle.fill")
            }
        }
        .panel()
    }

    @ViewBuilder private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            if model.isSample { SampleLabel() }
            if let workspace = model.currentWorkspace {
                Text("\(workspace.name), \(workspace.plan)")
                    .font(.subheadline)
                    .foregroundStyle(Palette.ink2)
                if let paused = workspace.paused {
                    Notice(text: "Farbaek has paused this workspace: \(paused)", tone: .failed, symbol: "pause.circle.fill")
                } else if workspace.agentsPaused {
                    Notice(text: "Agents are paused in this workspace. An owner or admin resumes them on the web.", tone: .approval, symbol: "pause.circle.fill")
                }
            }
        }
    }

    private func waitingPanel(_ home: Home) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(home.waiting)")
                    .font(.system(size: countSize, weight: .medium))
                    .tracking(-1)
                    .foregroundStyle(home.waiting > 0 ? Palette.approval : Palette.ink)
                    .contentTransition(.numericText())
                Text(home.waiting == 1 ? "change waits for you" : "changes wait for you")
                    .font(.headline.weight(.regular))
                    .foregroundStyle(Palette.ink2)
            }
            Text(home.waiting > 0 ? "Each one can be approved for 72 hours, only as the exact content you review." : "Nothing waits for you. New changes appear here when the agent proposes one.")
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
            SectionTitle("The agent at work")
            ForEach(runs) { run in
                NavigationLink(value: Destination.run(run.id)) {
                    HStack(spacing: 14) {
                        AgentOrb(live: true, size: 40)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(run.taskTitle).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                            Text("\(run.projectName), \(run.steps) steps").font(.footnote).foregroundStyle(Palette.ink2)
                        }
                        Spacer(minLength: 8)
                        StatusBadge(label: run.statusLabel, tone: run.status == "waiting" ? .approval : .info)
                    }
                    .card()
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func recent(_ tasks: [TaskItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Recent")
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

    private func read() async {
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
            StatusBadge(label: task.stateLabel, tone: Tone(task.tone))
            Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Palette.ink3)
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
