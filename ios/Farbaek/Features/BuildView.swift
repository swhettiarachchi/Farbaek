import SwiftUI

enum Effort: String, CaseIterable, Identifiable {
    case fast, balanced, deep

    var id: String { rawValue }

    var title: String {
        switch self {
        case .fast: return "Fast"
        case .balanced: return "Balanced"
        case .deep: return "Deep"
        }
    }

    var detail: String {
        switch self {
        case .fast: return "The quickest models. Stretches your usage furthest."
        case .balanced: return "Farbaek picks the model for each step. Recommended."
        case .deep: return "The strongest model your plan includes, for hard problems. Uses your usage faster."
        }
    }
}

/// One sentence becomes a project, a task and a drafted plan (ADR 0027). The
/// plan opens next; nothing starts until it's approved.
struct BuildView: View {
    @Environment(AppModel.self) private var model
    @State private var prompt = ""
    @State private var effort: Effort = .balanced
    @State private var projectId: String?
    @State private var projects: [ProjectItem] = []
    @State private var working = false
    @State private var failure: String?
    @FocusState private var focused: Bool

    private var ready: Bool { prompt.trimmingCharacters(in: .whitespacesAndNewlines).count >= 8 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if model.isSample { SampleLabel() }
                VStack(alignment: .leading, spacing: 12) {
                    Text("What do you want to build?")
                        .font(.title2.weight(.medium))
                        .tracking(-0.4)
                        .foregroundStyle(Palette.ink)
                    ZStack(alignment: .topLeading) {
                        if prompt.isEmpty {
                            Text("A booking page for my yoga studio, with class times and a contact form")
                                .font(.body)
                                .foregroundStyle(Palette.ink3)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .allowsHitTesting(false)
                        }
                        TextEditor(text: $prompt)
                            .font(.body)
                            .focused($focused)
                            .scrollContentBackground(.hidden)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .frame(minHeight: 140)
                            .accessibilityLabel("What do you want to build?")
                    }
                    .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.input, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.input, style: .continuous).stroke(focused ? Palette.accent : Palette.lineStrong.opacity(0.5), lineWidth: focused ? 2 : 1))

                    projectPicker
                    VStack(alignment: .leading, spacing: 8) {
                        Picker("Effort", selection: $effort) {
                            ForEach(Effort.allCases) { Text($0.title).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        Text(effort.detail).font(.footnote).foregroundStyle(Palette.ink2)
                    }
                }
                .panel()

                if let failure { Notice(text: failure, tone: .failed, symbol: "exclamationmark.triangle.fill") }
                if let blocker = model.writeBlocker {
                    Notice(text: blocker, symbol: "lock")
                }
                Button {
                    Task { await start() }
                } label: {
                    if working { ProgressView().tint(Palette.onAccent) } else { Label("Plan it", systemImage: "sparkles") }
                }
                .buttonStyle(PillButtonStyle(kind: .accent))
                .disabled(!ready || working || model.writeBlocker != nil)

                Text("Farbaek drafts what it will build and how it will check it. You approve the plan before the agent starts.")
                    .font(.footnote)
                    .foregroundStyle(Palette.ink3)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .screenBackground()
        .navigationTitle("Build")
        .scrollDismissesKeyboard(.interactively)
        .task(id: model.revision) { await readProjects() }
    }

    private var projectPicker: some View {
        Menu {
            Button {
                projectId = nil
            } label: {
                if projectId == nil { Label("A new project", systemImage: "checkmark") } else { Text("A new project") }
            }
            ForEach(projects.filter { !$0.archived }) { project in
                Button {
                    projectId = project.id
                } label: {
                    if projectId == project.id { Label(project.name, systemImage: "checkmark") } else { Text(project.name) }
                }
            }
        } label: {
            HStack {
                Image(systemName: "folder")
                Text(projects.first { $0.id == projectId }?.name ?? "A new project").lineLimit(1)
                Spacer()
                Image(systemName: "chevron.up.chevron.down").font(.footnote)
            }
            .font(.subheadline)
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.input, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.input, style: .continuous).stroke(Palette.line, lineWidth: 1))
        }
        .accessibilityLabel("Project: \(projects.first { $0.id == projectId }?.name ?? "a new project")")
    }

    private func readProjects() async {
        if let list: Listing<ProjectItem> = try? await model.api.get("projects") { projects = list.items }
    }

    private func start() async {
        failure = nil
        focused = false
        working = true
        defer { working = false }
        var payload: [String: Any] = ["prompt": prompt.trimmingCharacters(in: .whitespacesAndNewlines), "effort": effort.rawValue]
        // A follow-up names its project; without one, the build gets a new project.
        if let projectId { payload["projectId"] = projectId }
        do {
            let started: BuildStarted = try await model.api.send("POST", "builds", body: payload)
            prompt = ""
            model.changed()
            model.buildPath.append(Destination.plan(started.taskId))
        } catch {
            failure = error.localizedDescription
        }
    }
}

/// The plan as drafted: its outcome, files, acceptance criteria and checks,
/// approved as this exact version and hash before the agent starts.
struct PlanReviewView: View {
    let taskId: String
    @Environment(AppModel.self) private var model
    @State private var load: Load<PlanDetail> = .loading
    @State private var effort: Effort = .balanced
    @State private var working = false
    @State private var failure: String?
    @State private var note: String?

    var body: some View {
        ScrollView {
            LoadView(load: load, retry: read) { detail in
                VStack(alignment: .leading, spacing: 16) {
                    if model.isSample { SampleLabel() }
                    Text(detail.task.title).font(.title2.weight(.medium)).tracking(-0.4).foregroundStyle(Palette.ink)
                    StatusBadge(label: detail.task.stateLabel, tone: Tone(detail.task.tone))
                    if let plan = detail.plan {
                        planBody(plan)
                    } else {
                        Notice(text: "There's no plan yet. Open the task on the web to write one.", symbol: "doc.badge.ellipsis").card()
                    }
                    if let note { Notice(text: note, tone: .approval, symbol: "info.circle.fill").card() }
                    Link(destination: AppConfig.site("app/new/\(taskId)")) {
                        Label("Edit the plan on the web", systemImage: "safari")
                    }
                    .font(.subheadline.weight(.medium))
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 150)
            }
        }
        .screenBackground()
        .navigationTitle("Plan")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if let detail = load.value { actions(detail) }
        }
        .task { await read() }
    }

    @ViewBuilder private func planBody(_ plan: PlanDetail.Plan) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Outcome").font(.footnote.weight(.medium)).foregroundStyle(Palette.ink3)
            Text(plan.outcome).font(.body).foregroundStyle(Palette.ink).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Text("Version \(plan.version)").font(.footnote).foregroundStyle(Palette.ink3)
                HashText(sha: plan.sha256)
            }
        }
        .panel()

        if !plan.criteria.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle("Done when")
                ForEach(plan.criteria, id: \.self) { criterion in
                    Label {
                        Text(criterion.statement).fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: criterion.verification == "manual" ? "person.fill.checkmark" : "checkmark.circle")
                    }
                    .font(.subheadline)
                    .foregroundStyle(Palette.ink)
                }
            }
            .card()
        }

        VStack(alignment: .leading, spacing: 8) {
            SectionTitle("Files it may touch")
            ForEach(plan.files, id: \.self) { path in
                Text(path).font(.caption.monospaced()).foregroundStyle(Palette.ink2)
            }
            if !plan.checks.isEmpty {
                Text("Checks").font(.footnote.weight(.medium)).foregroundStyle(Palette.ink).padding(.top, 6)
                ForEach(plan.checks, id: \.self) { check in
                    Text(check).font(.caption.monospaced()).foregroundStyle(Palette.ink2)
                }
            }
            if !plan.forbidden.isEmpty {
                Text("Not allowed").font(.footnote.weight(.medium)).foregroundStyle(Palette.ink).padding(.top, 6)
                ForEach(plan.forbidden, id: \.self) { item in
                    Label(item, systemImage: "nosign").font(.footnote).foregroundStyle(Palette.ink2)
                }
            }
        }
        .card()

        if !plan.questions.isEmpty || !plan.assumptions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle("Open questions and assumptions")
                ForEach(plan.questions, id: \.self) { q in
                    Label(q, systemImage: "questionmark.circle").font(.footnote).foregroundStyle(Palette.approval)
                }
                ForEach(plan.assumptions, id: \.self) { a in
                    Label(a, systemImage: "text.quote").font(.footnote).foregroundStyle(Palette.ink2)
                }
            }
            .card()
        }
    }

    @ViewBuilder private func actions(_ detail: PlanDetail) -> some View {
        VStack(spacing: 10) {
            if let failure { Notice(text: failure, tone: .failed, symbol: "exclamationmark.triangle.fill") }
            if detail.canApprove {
                Picker("Effort", selection: $effort) {
                    ForEach(Effort.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                Button {
                    Task { await approve(detail) }
                } label: {
                    if working { ProgressView().tint(Palette.onAccent) } else { Label("Approve and build", systemImage: "faceid") }
                }
                .buttonStyle(PillButtonStyle(kind: .accent))
                .disabled(working)
            } else if let reason = detail.approveReason {
                Notice(text: reason, symbol: "lock")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(.bar)
    }

    private func read() async {
        do {
            let detail: PlanDetail = try await model.api.get("tasks/\(taskId)/plan")
            load = .loaded(detail)
        } catch {
            if load.value == nil { load = .failed(error.localizedDescription) }
        }
    }

    private func approve(_ detail: PlanDetail) async {
        guard let plan = detail.plan else { return }
        failure = nil
        guard await OwnerCheck.confirm("Approve the plan and start the agent") else {
            failure = "Not approved: Face ID or the passcode didn't confirm it was you."
            return
        }
        working = true
        defer { working = false }
        do {
            let started: PlanStarted = try await model.api.send("POST", "tasks/\(taskId)/plan/approve", body: [
                "version": plan.version,
                "sha256": plan.sha256,
                "expectedTaskVersion": detail.task.version,
                "effort": effort.rawValue,
            ])
            model.changed()
            if let runId = started.runId {
                // The run belongs to Build, wherever the plan was opened from.
                model.tab = .build
                model.buildPath = NavigationPath([Destination.run(runId)])
            } else {
                note = started.startNote
                await read()
            }
        } catch {
            failure = error.localizedDescription
        }
    }
}
