# ADR 0139: Continue on my computer

- Status: accepted (2026-10-30).
- From master spec §25: "Continue-on-Desktop Handoff (Next). Problem: LocalSend, AirDrop and Quick Share move files, not project state; cloud agents don't run on the user's own machine. Solution: A Capsule that carries contract, context passport, diff and next steps. The desktop runs tests locally and returns a ProofPack to the phone. Implementation: Mesh over LAN, plus the desktop runner."

## Decision

**The handoff goes through Farbaek, not Mesh.**
- The phone and the computer are both already paired with the same Farbaek workspace: the phone as the person signed in, the computer as a Farbaek Agent with its own token (ADR 0042), within its permission lease (ADR 0117).
- The iPhone app isn't compiled yet, and Android is the website, so neither can be a Mesh device on the local network today. Farbaek is the one channel both have.
- Project files never travel phone to computer: the computer downloads them from Farbaek the way an agent run does.

**What's handed over.** On a task with an approved contract that isn't finished, a contributor chooses **Continue on my computer** and one of the workspace's paired computers, with an optional note. Farbaek records a handoff (migration v84, `agent_handoffs`) with:
- the task, and its contract (the computer reads it as it does for a run);
- the change waiting for review, by its proposal hash;
- the checks: the contract's own, or Farbaek's for the kind of project;
- the note.

One handoff is open per task and computer, and it lapses after a day.

**Nothing runs until the person at the computer starts it.**
1. The Farbaek Agent app lists the handoffs sent to it, each with the exact commands it will run.
2. The person picks **Run the checks here**. The app then:
   - copies the project into a folder of its own and writes the waiting change in;
   - installs packages from the lockfile with install scripts off;
   - runs each check once through the command broker: a program and its arguments, never a shell, with a 10-minute limit each.
3. A check that needs a shell (pipes, `&&`, variables) or Farbaek's site check is reported as not run, with the reason. The copy is removed afterwards.

**What comes back is labelled for what it is.**
- **The report:** for each check, its exit code, time, whether it timed out, the SHA-256 of its output and the last 2,000 characters; the change's hash; the files not copied; the platform.
- **The digest:** Farbaek works out the report's digest itself, the SHA-256 of its canonical JSON with the handoff's id, from exactly what it received. It refuses a report for a different version of the change. The whole report is kept, so the digest can be checked again later.
- **On the task page:** it shows as "Reported by your computer: Farbaek didn't watch these run, so they don't verify the change", with "N of M checks passed on <computer>", each command's result and output, and the digest. It never feeds verification or a ProofPack's verified status.

**Who can do what:**
- Only contributors without `run_agents` withheld can hand off or withdraw.
- Only the computer it was handed to can open or report, inside its lease.
- Every step is audited (`handoff.requested`, `handoff.cancelled`, `handoff.finished`).

## Consequences

- From a phone, a person can get a change tested on their own machine, with their own tools and data, and see the result on the phone.
- Local results depend on that machine. The label says so, and verification still happens in Farbaek's sandbox (ADR 0047).

## Not done

- **The context passport (ADR 0116) in what the computer shows:** it shows the task, the contract (in Tasks) and the checks.
- **Nearby Mesh as a channel for handoffs:** once the phone apps are native and can join Mesh.
- **A ProofPack entry:** local reports stay separate from the project's verified evidence chain.
