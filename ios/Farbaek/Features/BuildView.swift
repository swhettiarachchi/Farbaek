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
    /// The plan refused it (402): in the US App Store, the way to see plans on the web.
    @State private var planBlocked = false
    @State private var askAI = false
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
                if planBlocked { SeePlansLink() }
                if let blocker = model.writeBlocker {
                    Notice(text: blocker, symbol: "lock")
                }
                Button {
                    if AIConsent.given {
                        Task { await start() }
                    } else {
                        focused = false
                        askAI = true
                    }
                } label: {
                    if working { ProgressView().tint(Palette.onAccent) } else { Label("Plan it", systemImage: "arrow.up") }
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
        .onAppear { takeChosenProject() }
        .onChange(of: model.buildProject) { _, _ in takeChosenProject() }
        .aiConsent(isPresented: $askAI) {
            AIConsent.given = true
            askAI = false
            Task { await start() }
        } onDecline: {
            askAI = false
            failure = "Nothing was sent. Farbaek needs your permission to use AI before it can plan this."
        }
    }

    /// "Describe a change" on a project: Build opens with that project picked, ready to type.
    private func takeChosenProject() {
        guard let chosen = model.buildProject else { return }
        model.buildProject = nil
        projectId = chosen
        focused = true
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
        guard let list: Listing<ProjectItem> = try? await model.api.get("projects") else { return }
        projects = list.items
        // A project from another workspace, or one archived since, is no longer a choice.
        if let chosen = projectId, !list.items.contains(where: { $0.id == chosen && !$0.archived }) { projectId = nil }
    }

    private func start() async {
        guard !working else { return }
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
            planBlocked = (error as? APIError)?.status == 402
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
    /// The plan refused it (402): in the US App Store, the way to see plans on the web.
    @State private var planBlocked = false
    @State private var note: String?
    @State private var askAI = false

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
                    if !model.isSample {
                        Link(destination: AppConfig.site("app/new/\(taskId)")) {
                            Label("Edit the plan on the web", systemImage: "safari")
                                .frame(minHeight: 44, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .font(.subheadline.weight(.medium))
                    }
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
        .aiConsent(isPresented: $askAI) {
            AIConsent.given = true
            askAI = false
            if let detail = load.value { Task { await approve(detail) } }
        } onDecline: {
            askAI = false
            failure = "Not started. Farbaek needs your permission to use AI before the agent can build this."
        }
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
            if planBlocked { SeePlansLink() }
            if detail.canApprove {
                Picker("Effort", selection: $effort) {
                    ForEach(Effort.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                Button {
                    if AIConsent.given {
                        Task { await approve(detail) }
                    } else {
                        askAI = true
                    }
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
        guard !working, let plan = detail.plan else { return }
        failure = nil
        working = true
        defer { working = false }
        guard await OwnerCheck.confirm("Approve the plan and start the agent") else {
            failure = "Not approved: Face ID or the passcode didn't confirm it was you."
            return
        }
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
            planBlocked = (error as? APIError)?.status == 402
        }
    }
}

/// The way to a bigger plan after the plan refused something (402): the App Store's plans when
/// they're open to this person, otherwise Billing on the web in the US App Store, otherwise nothing.
struct SeePlansLink: View {
    @Environment(AppModel.self) private var model
    @State private var showPlans = false

    var body: some View {
        if let billing = model.me?.billing, billing.applePurchases, billing.canManage, billing.managedBy != "web" {
            Button {
                showPlans = true
            } label: {
                Label("See plans", systemImage: "rectangle.stack")
            }
            .buttonStyle(PillButtonStyle(kind: .secondary))
            .sheet(isPresented: $showPlans) { PlansView().environment(model) }
        } else if model.canBuyOnWeb {
            Link(destination: WebPurchase.billingURL) {
                Label("See plans on www.farbaek.com", systemImage: "arrow.up.right.square")
            }
            .buttonStyle(PillButtonStyle(kind: .secondary))
        }
    }
}
