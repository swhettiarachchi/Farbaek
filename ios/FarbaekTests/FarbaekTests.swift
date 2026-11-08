import XCTest
@testable import Farbaek

/// The app's own checks (ADR 0110). The fixtures are the server's real sample
/// answers (src/server/phone/fixtures.test.ts), so decoding them proves the
/// models still read what Farbaek sends.
final class FarbaekTests: XCTestCase {
    private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        let url = try XCTUnwrap(Bundle(for: FarbaekTests.self).url(forResource: name, withExtension: "json"), "Missing fixture \(name).json")
        return try JSONDecoder().decode(Envelope<T>.self, from: Data(contentsOf: url)).data
    }

    func testPKCEMatchesRFC7636() {
        // The example in RFC 7636, appendix B.
        XCTAssertEqual(PKCE.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        let verifier = PKCE.random()
        XCTAssertEqual(verifier.count, 43)
        XCTAssertNil(verifier.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=")))
        XCTAssertNotEqual(verifier, PKCE.random())
    }

    func testAppleNonceHashesTheWayAuthChecksIt() {
        // Supabase Auth compares the token's nonce with the lowercase hex SHA-256 of the raw nonce (FIPS 180-2 example).
        XCTAssertEqual(AppleSignIn.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        let attempt = AppleSignIn.newAttempt()
        XCTAssertEqual(attempt.nonce.count, 43)
        XCTAssertEqual(attempt.hashedNonce, AppleSignIn.sha256Hex(attempt.nonce))
        XCTAssertNotEqual(attempt.nonce, AppleSignIn.newAttempt().nonce)
    }

    func testReadsFarbaeksTimes() throws {
        let micro = try XCTUnwrap(FarbaekDate.parse("2026-10-29T11:58:00.123456+00:00"))
        let milli = try XCTUnwrap(FarbaekDate.parse("2026-10-29T11:58:00.123Z"))
        XCTAssertEqual(micro.timeIntervalSince1970, milli.timeIntervalSince1970, accuracy: 0.001)
        XCTAssertNotNil(FarbaekDate.parse("2026-10-29T11:58:01Z"))
        XCTAssertNotNil(FarbaekDate.parse("2026-10-29T11:58:01.5+00:00"))
        XCTAssertNil(FarbaekDate.parse("yesterday"))
    }

    func testSaysHowLongAnApprovalStaysOpen() {
        XCTAssertEqual(ClosesIn.words(72 * 3600), "Closes in 3 days")
        XCTAssertEqual(ClosesIn.words(30 * 3600), "Closes tomorrow")
        XCTAssertEqual(ClosesIn.words(5 * 3600), "Closes in 5 hours")
        XCTAssertEqual(ClosesIn.words(3600), "Closes in 1 hour")
        XCTAssertEqual(ClosesIn.words(30 * 60), "Closes in 30 minutes")
        XCTAssertEqual(ClosesIn.words(-5), "Expired")
    }

    func testEveryStatusHasItsKindAndMark() {
        // The API's tone words still read, with a plain fact ("neutral") as information (ADR 0183).
        XCTAssertEqual(Tone("verified"), .verified)
        XCTAssertEqual(Tone("approval"), .approval)
        XCTAssertEqual(Tone("failed"), .failed)
        XCTAssertEqual(Tone("unverified"), .unverified)
        XCTAssertEqual(Tone("neutral"), .info)
        XCTAssertEqual(Tone("something new"), .info)
        // A task's kind comes from its state, as the web's stateKind() works it out.
        XCTAssertEqual(Tone(taskState: "EXECUTING", tone: "info"), .working)
        XCTAssertEqual(Tone(taskState: "PARTIALLY_VERIFIED", tone: "unverified"), .attention)
        XCTAssertEqual(Tone(taskState: "CANCELLED", tone: "unverified"), .off)
        XCTAssertEqual(Tone(taskState: "BLOCKED", tone: "failed"), .blocked)
        XCTAssertEqual(Tone(taskState: "A_STATE_FROM_LATER", tone: "approval"), .approval)
        // Every kind draws a mark; none is left blank.
        for tone in Tone.allCases {
            XCTAssertFalse(tone.symbol.isEmpty, "\(tone) has no symbol")
        }
        XCTAssertEqual(RunView.tone("finished"), .done)
        XCTAssertEqual(RunView.tone("interrupted"), .paused)
    }

    func testSaysHowMuchAIUsageIsUsed() {
        XCTAssertEqual(TodayView.usageSentence(percent: 2, period: "month", endsAt: nil), "Used 2% of this month's AI usage.")
        XCTAssertEqual(TodayView.usageSentence(percent: 100, period: "trial", endsAt: nil), "You've used all of the trial's AI usage.")
    }

    func testDecodesTheSampleAccount() throws {
        let me = try fixture("me", as: Me.self)
        XCTAssertTrue(me.sample)
        XCTAssertFalse(me.writes.enabled)
        XCTAssertNotNil(me.writes.reason)
        XCTAssertEqual(me.workspaces.first?.id, me.current)
    }

    func testDecodesHomeTasksAndProjects() throws {
        let home = try fixture("home", as: Home.self)
        XCTAssertGreaterThan(home.waiting, 0)
        XCTAssertFalse(home.recent.isEmpty)
        XCTAssertEqual(home.usage?.period, "trial")
        XCTAssertFalse(try fixture("tasks", as: Listing<TaskItem>.self).items.isEmpty)
        XCTAssertFalse(try fixture("projects", as: Listing<ProjectItem>.self).items.isEmpty)
    }

    func testDecodesAnApprovalWithItsDiff() throws {
        let approvals = try fixture("approvals", as: Approvals.self)
        let card = try XCTUnwrap(approvals.items.first)
        XCTAssertEqual(card.sha256.count, 64)
        let detail = try fixture("approval", as: ApprovalDetail.self)
        XCTAssertEqual(detail.task.id, card.taskId)
        XCTAssertFalse(detail.canApprove)
        let lines = detail.proposal.files.flatMap { $0.hunks.flatMap(\.lines) }
        XCTAssertTrue(lines.contains { $0.kind == "add" && $0.new != nil })
    }

    func testDecodesATaskAndItsPlan() throws {
        let task = try fixture("task", as: TaskDetail.self)
        XCTAssertFalse(task.stages.isEmpty)
        XCTAssertFalse(task.history.isEmpty)
        let plan = try fixture("plan", as: PlanDetail.self)
        XCTAssertEqual(plan.plan?.sha256.count, 64)
        XCTAssertGreaterThan(plan.task.version, 0)
    }

    func testDecodesAProjectAndATasksNextStep() throws {
        let project = try fixture("project", as: ProjectDetail.self)
        XCTAssertFalse(project.tasks.isEmpty)
        XCTAssertNil(project.address)
        let task = try fixture("task", as: TaskDetail.self)
        XCTAssertEqual(task.nextStep?.tone, "action")
        XCTAssertEqual(task.nextStep?.action?.target, "change")
    }

    func testDecodesARunWaitingOnAQuestion() throws {
        let run = try fixture("run", as: RunDetail.self)
        XCTAssertTrue(run.run.live)
        XCTAssertEqual(run.steps.count, 4)
        XCTAssertEqual(run.steps.first { $0.kind == "command" }?.exitCode, 0)
        let question = try XCTUnwrap(run.question)
        XCTAssertEqual(question.bindingHash.count, 64)
        XCTAssertTrue(question.canAnswer)
    }

    func testReadsFarbaeksErrors() throws {
        let body = #"{"error":{"code":"READ_ONLY","message":"You have view-only access to this workspace."}}"#
        let decoded = try JSONDecoder().decode(ErrorEnvelope.self, from: Data(body.utf8))
        XCTAssertEqual(decoded.error.code, "READ_ONLY")
        let nothing = try JSONDecoder().decode(Envelope<Nothing?>.self, from: Data(#"{"data":null}"#.utf8))
        XCTAssertNil(nothing.data)
    }
}
