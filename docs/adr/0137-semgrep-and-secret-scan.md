# ADR 0137: Semgrep and a secret scan in the security check

- Status: accepted (2026-10-30).
- From master spec §10, ProofPack: "static, dependency and secret findings: Semgrep (SAST), OSV-Scanner (dependencies), gitleaks and/or TruffleHog (secrets) [VERIFY current CLIs]". Dependencies came in stage 107 (ADR 0130).

## Decision

**Semgrep, with Farbaek's own rules.**
- **Why our own rules.** The sandbox can reach package registries only, so Semgrep's rule registry is out of reach. Its rules also carry their own licence.
- **What they cover.** Farbaek keeps its own Semgrep ruleset (`src/core/security/static-scan.ts`, 14 rules) for what its regex rules (ADR 0024) can't express:
  - a value from the request flowing into a shell command, a file path, a redirect, a fetch or a regular expression;
  - certificate checks turned off;
  - the whole request body saved (mass assignment);
  - `Math.random` identifiers;
  - script-readable cookies;
  - `shell=True` and `os.system`;
  - pickle and unsafe YAML loading;
  - Python `eval` and `exec`;
  - Flask debug mode.
- **How it's written.** The ruleset is generated as YAML with every pattern single-quoted, and a test checks every line's shape. Each rule's title, detail and fix live in the code beside it, so findings read like Farbaek's other findings.

**detect-secrets for secrets.**
- **Why not gitleaks or TruffleHog.** Both ship as binaries from GitHub releases, which a sandbox can't reach. detect-secrets (Yelp, on PyPI) is an established secret scanner the sandbox can install.
- **Its settings:**
  - Its high-entropy detectors are off, because lockfile hashes and build IDs flood them, and lockfiles are left out for the same reason.
  - Its pattern detectors (cloud keys, tokens, private keys, keyword assignments) stay on.
- **Severity:** a private key is critical, a known token format is high, a keyword or JWT is medium.

**How they run.**
1. One disposable sandbox gets the project's files. Its network reaches the package registries only.
2. Both tools are installed from PyPI at pinned versions (Semgrep 1.179.0, detect-secrets 1.5.0, each at least two weeks old when chosen) into a throwaway virtual environment outside the project folder.
3. They run with Semgrep's metrics and version check off.
4. No project code runs and no project packages are installed.

**Nothing secret comes back.**
- A small script in the sandbox reads each tool's JSON and prints only the rule or secret type, the file and the line, for at most 500 results.
- Semgrep's matched source lines and detect-secrets' hashes stay in the sandbox.

**In the report:**
- Two new checks, "Semgrep with Farbaek's rules" and "Secrets in the code (detect-secrets)". Each is reported as run with its detail, or as not run with the reason.
- If one tool fails, the other's results still count.
- A finding at a file and line another check already reported isn't counted twice.
- Findings are labelled Semgrep or Secret scan.

## Consequences

- **Cost.** A security check now uses a second short sandbox session, counted as sandbox time.
- **Coverage.** Semgrep here is only as broad as Farbaek's 14 rules. The report names the rule count, never "complete" coverage.

## Not done

- **gitleaks or TruffleHog:** both need the GitHub release hosts allowed in a reviewed network profile.
- **Semgrep's registry rulesets.**
- **Scanning git history for secrets:** projects in Farbaek are files, not repositories.
