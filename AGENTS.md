# Repository Instructions

## Planning Flow

Use this flow when the user explicitly wants to plan a new feature together.

1. Get up to speed on the user's feature description by reading the agent documentation in the Agent Documentation section first, then inspecting only the relevant code paths it points to.
2. Refine the spec with the user.
3. Once the spec is agreed, create `docs/specs/[feature-name]-spec.md` and ask the user to sign it off.
4. After spec sign-off, create `docs/plans/[feature-name]-exec-plan.md` using `PLANS.md` as the source of truth, then ask the user to sign it off.
5. Implement the feature after the execution plan is signed off.

If the user explicitly waives part of this flow for the current task, follow the user's instruction.

## Agent Documentation

`docs/agent-docs/` is the canonical agent-facing architecture knowledge base for this repo.

Before planning substantial work, changing architecture, or working in an unfamiliar area:

1. read `docs/agent-docs/agent-architecture-map.md` first,
2. follow its cross-references to only the relevant code and deeper docs,
3. treat its architecture and code-design axioms as normative unless the user approves a challenge.

Historical documents under `docs/specs/` and `docs/plans/` are not the primary source of truth for current architecture orientation. Use them only as historical context when needed.

## Documentation Maintenance

Use the project-local `doc-update` skill when:

1. architecture or code-design changes would make `docs/agent-docs/` stale,
2. infrastructure changes affect how an agent should orient itself,
3. a new substantial feature changes module boundaries, concepts, or assumptions,
4. the user asks to update or maintain the agent knowledge base.

Treat architecture documentation as part of the change, not as optional follow-up work, when the change affects durable structure or assumptions.

If the `doc-update` skill does not exist, notify the user.

## Code design guidance

When working on code design, refactoring, architecture, or code review tasks, first read the repository's design-guidance document `coding-quality.md`, if it exists. Treat that document as the repository's source of truth for local design preferences.

The repository design-guidance document takes precedence over conflicting skill guidance on matters of code structure, layering, naming, responsibility boundaries, and review standards.

Apply that guidance as follows:
- Prefer the repository guidance over general design instincts or conflicting skill preferences.
- If the repository guidance conflicts with framework conventions, correctness, security, explicit user instructions, or hard technical constraints, follow the constraint and explain the deviation briefly.
- Do not apply the repository guidance mechanically; use judgment where the document leaves room for interpretation.

For substantial code changes, design work, or code reviews, perform a final pass against the repository design-guidance document and call out any important deviations, tradeoffs, or unresolved tensions.

## Skill use during planning and execution

When the agent environment provides workflow, design, implementation, testing, or documentation skills, use them according to their triggers. Do not treat an execution plan as an exemption from skill use because the user asked to "execute the plan" rather than explicitly asking to write code. Similarly, do not treat writing a spec as an exemption from skill use because the user did not explicitly ask to design or refactor.

Writing a spec or execution plan requires applicable design skills when the document makes or records design decisions.

Executing an execution plan requires applicable implementation skills when the plan calls for code, tests, refactors, API changes, build changes, documentation changes, or architecture changes. Re-evaluate the plan against the current repository state before editing, then use the skills triggered by the actual work being performed.

Record in the execution plan which skills (or equivalent repository guidance) governed the work. If a skill the repository expects is unavailable, say so and apply the closest repository guidance instead.

## Goal-based verification

Before claiming a feature or fix is complete, identify the user-visible goal or acceptance behavior in one sentence.

Verification must prove that goal, not just prove that code changed or tests pass.

Use automated verification when unit, integration, or e2e tests can directly prove the goal. If the goal involves perceived UX, real app behavior, performance, media playback, layout, or other behavior not fully covered by tests, perform targeted manual QA in the actual app and report what was verified.

Do not claim completion from implementation-level evidence when the requested goal is user-visible behavior.

### UI evaluation: user impact determines the gate

Judge UI implementations and component libraries by effects users can perceive through actual product workflows. Automated and synthetic tests provide evidence; an internal-state discrepancy or extreme input sequence is not, by itself, an adoption blocker.

Before rejecting a UI component or expanding investigation because a test fails:

1. State the user-facing consequence and reproduce it through relevant product controls, input methods and representative timing where possible.
2. Distinguish ordinary-use failures, reachable edge cases, and synthetic-only findings. Report what was observed; do not infer frequency or severity from a stress-test failure count.
3. Weigh impact, reachability, recovery and mitigation cost against the component's benefits. Choose the smallest next check that could change the decision; do not let theoretical completeness drive an open-ended comparison.
4. Keep defects and uncertainty recorded without automatically blocking progress. A successful manual session does not prove absence of a bug, just as a synthetic failure does not prove poor usability.

User-perceivable effects include keyboard and assistive-technology access, focus, playback continuity and data outcomes, not only visual appearance. This principle does not waive explicit correctness, accessibility or data-integrity requirements; it makes the relationship between a test and those requirements explicit.

## Cost-aware subagent delegation

Use the project-local `cost-aware-delegation` skill whenever considering or
performing subagent delegation. The primary purpose of delegation is to replace
work by the strong root model with a less expensive model that is expected to be
comparably reliable for the bounded task. Do not delegate for parallelism alone.

Delegate only when the cheaper model is suitable, the task is large enough to
amortize briefing and verification, the brief can bound the work precisely, and
the result can be independently checked for materially less effort than doing the
task directly. Otherwise keep the task with the root. Keep architecture,
ambiguous or cross-cutting coding, research synthesis and decisions, user
interaction, and final acceptance with the root.

Do not fetch current token rates for routine decisions. Use known relative model
costs and delegate only when the conservative upper estimate of briefing,
subagent work, verification, and recovery remains clearly below direct root work;
the skill defines a practical default margin and when current rates merit review.

Before relying on a subagent result, perform the predefined focused check. A
completion notification without the requested deliverable and evidence is a
stalled result, not proof of completion. Delegation briefs must require agents to
report specification or oracle disagreements rather than tune to match them.

When delegation occurs, keep the skill's compact task-local ledger, complete its
pre-dispatch and acceptance records, and reconcile actual launches before task
closure. Carry the ledger path and open entries through compaction and handoffs.
Include a short outcome assessment at task completion; do not infer measured
savings from successful delivery or change policy from a single result.

## Shell Choice On Windows

On Windows, default to the active shell and use native syntax for that shell.
Prefer PowerShell for ordinary file, text, and process operations unless the
task specifically requires Bash, WSL, Git Bash, or another Unix-style toolchain.

If a task is better suited to Bash on Windows, invoke Bash explicitly rather
than mixing Bash syntax into a PowerShell command. Do not assume shell features,
quoting rules, pipes, or multiline input forms transfer between shells.

## Cross-Platform Text and JSON Encoding

When generating JSON or other machine-readable text from PowerShell, write
UTF-8 without a BOM. Windows PowerShell 5's `-Encoding UTF8` emits a BOM, so
use an explicit BOM-free UTF-8 encoding when the output will be consumed by
Node or another strict parser. Readers of generated or legacy JSON should
tolerate and strip a leading UTF-8 BOM before parsing. Keep this producer and
consumer behavior covered by a regression fixture or test.

## Shell/Text Extraction

When extracting or matching prose from external sources in shell commands, avoid
embedding long exact strings with smart punctuation, non-ASCII typography, or
copied whitespace directly into shell string literals. Prefer stable ASCII
anchors, structural selectors, wildcard fragments, regexes, or source-loaded
comparison strings that match the minimum needed text.

Match multiline input syntax to the active shell. Do not use Bash heredocs in
PowerShell; use PowerShell here-strings instead. More generally, verify that
shell features and quoting syntax are valid for the current shell before
running extraction or text-processing commands.
