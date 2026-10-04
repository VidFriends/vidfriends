# AGENTS.md: instructions for engineering agents

VidFriends is a private "For You" feed made only of videos your friends sent you. This repository is the **only** VidFriends project. Seven earlier restarts were consolidated here on 2026-10-03, and their code was removed (it is preserved in the tag `legacy-code-snapshot`). Implementation restarts from scratch against the plan below.

## Read before you plan or change anything

1. **[docs/ROADMAP.md](docs/ROADMAP.md)** is the canonical plan, covering scope, priorities, milestone tasks, status, and the next actionable work. Always start here.
2. Read the specifications the roadmap task links to, and only the sections you need:

| Question | Authoritative document |
|---|---|
| Why are we building this? Business constraints, open questions | [BRD](docs/requirements/BRD.md) |
| Who is it for, what capabilities, journeys, non-goals | [PRD](docs/requirements/PRD.md) |
| Exact behaviour: workflows, rules (`BR-*`), state machines, permissions | [FRD](docs/requirements/FRD.md) |
| **The requirement itself** (`FR-*`, `NFR-*`) and how it is verified | [SRS](docs/requirements/SRS.md) (the canonical source) |
| Components, topology, trust boundaries, data flows | [HLD](docs/design/HLD.md) |
| Module structure, authorization model, jobs, client architecture | [SDD](docs/design/SDD.md) |
| Engineering choices, security engineering, deploy/ops, test strategy | [TDD](docs/design/TDD.md) |
| Schema, API outline, pipeline states, security parameters | [LLD](docs/design/LLD.md) |
| Architectural decisions and their rationale | [docs/adr/](docs/adr/README.md) |
| What went wrong before (lessons `L-*`) | [docs/legacy/AUDIT.md](docs/legacy/AUDIT.md) (history, not requirements) |

## Rules

1. **Work from roadmap tasks.** If a change is not covered by a roadmap task, add or adjust the task in `docs/ROADMAP.md` in the same PR, with an objective, references, dependencies and a completion check.
2. **Cite IDs.** PR descriptions and commit messages reference the task ID (for example `M1-T7`) and the requirement IDs (`FR-AUTH-04`) they implement.
3. **Done means verified.** A task is done only when it meets all of these:
   - Its completion check passes in CI.
   - The feature is reachable in the UI or API, with no stubs or fabricated data.
   - Every new route that takes an id is in the authorization matrix.
   - The relevant docs are updated.

   Do not mark anything ✅ in the roadmap without linking evidence (a PR or test path).
4. **Keep docs and code in sync in the same PR.** If you change behaviour, schema or API, update the FRD, SRS or LLD and the contracts. If you change status, update the roadmap. The Zod contracts in `packages/contracts` are the executable API source of truth once they exist. Keep LLD §3 consistent with them.
5. **Architectural changes need an ADR.** This covers anything that alters a decision in `docs/adr/`, adds infrastructure, changes the security model, or changes a cross-cutting pattern. Add a new numbered ADR and mark the old one `Superseded by …`. Never edit an accepted ADR's decision text.
6. **Conflicts:**
   - The SRS wins on requirement wording.
   - The roadmap wins on scope and sequencing.
   - ADRs win on architecture.

   If you find a contradiction, do not silently pick one side. Fix the non-authoritative document, or, if it needs a judgement call, record the decision (an ADR or a roadmap note) and flag it in your PR.
7. **Assumptions:** label them explicitly, as `Assumption:` in docs or PRs, and add any that matter to ROADMAP §3.3. Owner-only questions go in BRD §7. Do not block on them if a conservative default exists.
8. **Legacy code is reference only.** You may read it (`git show legacy-code-snapshot:legacy/<repo>/<path>`), but do not copy it forward without checking it against the SRS and the known defects in the audit.
9. **Security basics are non-negotiable:**
   - Derive the acting user from the session.
   - Never commit secrets.
   - Never edit a merged migration.
   - Never pass user input as CLI options.
   - Keep logs free of tokens and content.
10. **Git:** the default branch is `main`, which is protected. Work on branches and open PRs; do not push directly to `main` once CI exists. The owner has delegated merging (2026-10-04): an agent may merge its own PR into `main` once every CI check on the latest commit is green and no review thread is open. Then it starts the next piece of work on a fresh branch from `main`.
11. **Blockers go to the owner as multiple-choice questions.** When work needs an owner-only decision or fact, ask with the built-in multiple-choice question tool (in Claude Code: `AskUserQuestion`) rather than burying the question in prose. Ask up to four questions at once, each with 2–4 concrete options. Put the recommended option first and mark it "(Recommended)". Each option's description says what you will do if it is chosen. Record the answers in the roadmap or BRD §7, then keep working on anything that isn't blocked while you wait.

## Repository layout

Currently the repository holds documentation only. The target layout is in [ADR-0012](docs/adr/0012-monorepo-and-tooling.md) and is created by roadmap task M1-T1.
