import Foundation

// The shapes /api/v1/app answers with (src/server/phone/views.ts, ADR 0110).
// Times stay as Farbaek's ISO strings and are read with FarbaekDate where shown.

struct Envelope<T: Decodable>: Decodable {
    let data: T
}

struct ErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String
        let message: String
    }
    let error: Body
}

/// For answers whose data is null.
struct Nothing: Decodable {}

struct TokenGrant: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Double
    let deviceId: String?
}

struct Me: Decodable {
    struct User: Decodable {
        let id: String
        let email: String
    }
    struct Writes: Decodable {
        let enabled: Bool
        let reason: String?
    }
    struct Push: Decodable {
        let available: Bool
        let on: Bool
    }
    let sample: Bool
    let user: User
    let workspaces: [Workspace]
    let current: String?
    let role: String?
    let writes: Writes
    let push: Push
}

struct Workspace: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let plan: String
    let paused: String?
    let agentsPaused: Bool
}

struct TaskItem: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let state: String
    let stateLabel: String
    let tone: String
    let projectId: String
    let projectName: String
    let createdAt: String
    let updatedAt: String
}

struct RunItem: Decodable, Identifiable, Hashable {
    let id: String
    let taskId: String
    let taskTitle: String
    let projectName: String
    let status: String
    let statusLabel: String
    let live: Bool
    let effort: String
    let effortLabel: String
    let model: String?
    let steps: Int
    let outcome: String?
    let proposalId: String?
    let startedAt: String
    let endedAt: String?
}

struct Home: Decodable {
    let waiting: Int
    let live: [RunItem]
    let recent: [TaskItem]
    let projects: Int
}

struct WalletFact: Decodable, Hashable {
    let kind: String
    let tone: String
    let label: String
}

struct ApprovalCard: Decodable, Identifiable, Hashable {
    var id: String { taskId }
    let taskId: String
    let proposalId: String
    let title: String
    let projectName: String
    let sha256: String
    let createdAt: String
    let expiresAt: String
    let byAgent: Bool
    let facts: [WalletFact]
    let checks: [String]
    let checksNote: String?
    let canApprove: Bool
}

struct Approvals: Decodable {
    let items: [ApprovalCard]
    let more: Int
}

struct DiffLine: Decodable, Hashable {
    let kind: String
    let text: String
    let old: Int?
    let new: Int?
}

struct DiffHunk: Decodable, Hashable {
    let lines: [DiffLine]
}

struct FileChange: Decodable, Identifiable, Hashable {
    var id: String { path }
    let path: String
    let kind: String
    let reason: String
    let added: Int
    let removed: Int
    let hunks: [DiffHunk]
    let truncated: Bool
}

struct PolicyFinding: Decodable, Hashable {
    let rule: String
    let outcome: String
    let detail: String
}

struct Policy: Decodable, Hashable {
    let outcome: String
    let findings: [PolicyFinding]
}

struct DroppedChange: Decodable, Hashable {
    let path: String
    let reason: String
}

struct ProposalDetail: Decodable {
    let id: String
    let status: String
    let sha256: String
    let createdAt: String
    let expiresAt: String
    let model: String?
    let byAgent: Bool
    let summary: String
    let steps: [String]
    let risks: [String]
    let checks: [String]
    let checksNote: String?
    let policy: Policy?
    let dropped: [DroppedChange]
    let files: [FileChange]
}

struct ApprovalDetail: Decodable {
    let task: TaskItem
    let proposal: ProposalDetail
    let canApprove: Bool
    let approveReason: String?
    let canDiscard: Bool
}

struct Applied: Decodable {
    let written: Int
    let checking: Bool
}

struct LifecycleStage: Decodable, Hashable {
    let key: String
    let label: String
    let status: String
    let note: String
}

struct HistoryItem: Decodable, Identifiable, Hashable {
    let id: String
    let from: String
    let to: String
    let toLabel: String
    let actor: String
    let at: String
}

struct TaskDetail: Decodable {
    struct Contract: Decodable {
        let version: Int
        let status: String
        let outcome: String
    }
    struct Proposal: Decodable {
        let id: String
        let status: String
        let files: Int
        let sha256: String
        let expiresAt: String
    }
    struct Proof: Decodable, Hashable {
        let digest: String
        let status: String
        let createdAt: String
    }
    struct Verification: Decodable {
        let status: String
        let result: String?
        let failure: String?
        let startedAt: String
        let finishedAt: String?
    }
    let task: TaskItem
    let stages: [LifecycleStage]
    let history: [HistoryItem]
    let contract: Contract?
    let proposal: Proposal?
    let proofs: [Proof]
    let verification: Verification?
    let runs: [RunItem]
}

struct PlanDetail: Decodable {
    struct PlanTask: Decodable {
        let id: String
        let title: String
        let state: String
        let stateLabel: String
        let tone: String
        let projectName: String
        let version: Int
    }
    struct Criterion: Decodable, Hashable {
        let id: String
        let statement: String
        let verification: String
    }
    struct Plan: Decodable {
        let version: Int
        let status: String
        let sha256: String
        let outcome: String
        let files: [String]
        let allowed: [String]
        let forbidden: [String]
        let criteria: [Criterion]
        let checks: [String]
        let assumptions: [String]
        let questions: [String]
        let recovery: String
    }
    let task: PlanTask
    let plan: Plan?
    let canApprove: Bool
    let approveReason: String?
}

struct BuildStarted: Decodable {
    let taskId: String
    let projectId: String
    let planned: Bool
    let planNote: String?
}

struct PlanStarted: Decodable {
    let runId: String?
    let startNote: String?
}

struct RunStep: Decodable, Identifiable, Hashable {
    let id: Int
    let kind: String
    let title: String
    let detail: String
    let status: String?
    let exitCode: Int?
    let at: String
}

struct RunQuestion: Decodable, Hashable {
    let requestId: String
    let bindingHash: String
    let display: String
    let risk: String?
    let reason: String
    let why: String
    let canAnswer: Bool
}

struct RunFinish: Decodable, Hashable {
    let summary: String
    let steps: [String]
    let risks: [String]
    let checks: [String]
}

struct RunDetail: Decodable {
    let run: RunItem
    let steps: [RunStep]
    let cursor: Int
    let question: RunQuestion?
    let finish: RunFinish?
}

struct ProjectItem: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let createdAt: String
    let archived: Bool
}

struct Listing<T: Decodable>: Decodable {
    let items: [T]
}

struct PushState: Decodable {
    let on: Bool
}

struct SignedOut: Decodable {
    let signedOut: Bool
}
