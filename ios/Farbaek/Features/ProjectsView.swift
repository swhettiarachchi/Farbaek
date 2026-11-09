import SwiftUI

/// Your sites and apps (ADR 0173).
struct ProjectsView: View {
    @Environment(AppModel.self) private var model
    @State private var load: Load<[ProjectItem]> = .loading

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if model.isSample { SampleLabel() }
                LoadView(load: load, retry: read) { projects in
                    if projects.isEmpty {
                        ContentUnavailableView {
                            Label("No projects yet", systemImage: "folder")
                        } description: {
                            Text("Describe something to build, and its project appears here.")
                        } actions: {
                            Button("Build something") { model.tab = .build }
                                .buttonStyle(PillButtonStyle(kind: .accent, compact: true))
                        }
                        .frame(minHeight: 300)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(projects) { project in
                                NavigationLink(value: Destination.project(project.id)) {
                                    ProjectRow(project: project)
                                }
                                .buttonStyle(.plain)
                                if project.id != projects.last?.id { Divider().overlay(Palette.line) }
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
        .navigationTitle("Projects")
        .refreshable { await read() }
        .task(id: model.revision) { await read() }
    }

    private func read() async {
        do {
            let list: Listing<ProjectItem> = try await model.api.get("projects")
            withAnimation(.easeOut(duration: 0.2)) { load = .loaded(list.items) }
        } catch {
            if load.value == nil { load = .failed(error.localizedDescription) }
        }
    }
}

struct ProjectRow: View {
    let project: ProjectItem

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "folder")
                .foregroundStyle(Palette.accent)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(project.name).font(.body.weight(.medium)).foregroundStyle(Palette.ink).lineLimit(2)
                if let description = project.description, !description.isEmpty {
                    Text(description).font(.footnote).foregroundStyle(Palette.ink2).lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            if project.archived { StatusBadge(label: "Archived", tone: .off) }
            Image(systemName: "chevron.right").font(.footnote).foregroundStyle(Palette.ink3).accessibilityHidden(true)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
    }
}

/// One project: where it's live, its tasks, and the one thing most people came to do next.
/// A generated site never runs inside the app (guideline 2.5.2), so seeing and editing it open in the browser.
struct ProjectDetailView: View {
    let projectId: String
    @Environment(AppModel.self) private var model
    @State private var load: Load<ProjectDetail> = .loading

    var body: some View {
        ScrollView {
            LoadView(load: load, retry: read) { detail in
                VStack(alignment: .leading, spacing: 16) {
                    if model.isSample { SampleLabel() }
                    header(detail)
                    tasks(detail.tasks)
                    if !model.isSample {
                        WebLink(path: "app/projects/\(projectId)") {
                            Label("Preview and edit on the web", systemImage: "safari")
                                .frame(minHeight: 44, alignment: .leading)
                                .contentShape(Rectangle())
                        }
                        .font(.subheadline.weight(.medium))
                    }
                    ReportLink(subject: .project(projectId))
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .screenBackground()
        .navigationTitle("Project")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await read() }
        .task(id: model.revision) { await read() }
    }

    private func header(_ detail: ProjectDetail) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(detail.project.name).font(.title2.weight(.medium)).tracking(-0.4).foregroundStyle(Palette.ink)
            if let description = detail.project.description, !description.isEmpty {
                Text(description).font(.subheadline).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true)
            }
            if detail.project.archived {
                Notice(text: "This project is archived. Everything stays readable, and nothing in it can change.", symbol: "archivebox")
            }
            if let address = detail.address, let url = URL(string: address) {
                Label("Live at \(Self.withoutScheme(address))", systemImage: "globe")
                    .font(.footnote)
                    .foregroundStyle(Palette.verified)
                Link(destination: url) {
                    Label("Open your site", systemImage: "safari")
                }
                .buttonStyle(PillButtonStyle(kind: .accent))
            }
            if !detail.project.archived {
                Button {
                    // Back to the box to type in, whatever Build had open.
                    model.buildPath = NavigationPath()
                    model.buildProject = projectId
                    model.tab = .build
                } label: {
                    Label("Describe a change", systemImage: "pencil.line")
                }
                .buttonStyle(PillButtonStyle(kind: detail.address == nil ? .accent : .secondary))
                .disabled(model.writeBlocker != nil)
                if let blocker = model.writeBlocker { Notice(text: blocker, symbol: "lock") }
            }
        }
        .panel()
    }

    private func tasks(_ tasks: [TaskItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle("Tasks")
            if tasks.isEmpty {
                Notice(text: "No tasks in this project yet.").card()
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

    private static func withoutScheme(_ address: String) -> String {
        address.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
    }

    private func read() async {
        do {
            let detail: ProjectDetail = try await model.api.get("projects/\(projectId)")
            load = .loaded(detail)
        } catch {
            if load.value == nil { load = .failed(error.localizedDescription) }
        }
    }
}
