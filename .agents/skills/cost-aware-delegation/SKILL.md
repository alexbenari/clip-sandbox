---
name: cost-aware-delegation
description: Use when considering or performing Codex subagent delegation in this project; applies a cost-first eligibility gate, chooses the least expensive suitable model, and defines bounded briefs, evidence, ownership, and verification.
---

# Cost-Aware Delegation

Use delegation to substitute a less expensive model for work that would otherwise
consume the strong root model. Do not delegate merely to create parallel activity.
Subagents add briefing, context, coordination, and verification cost.

## Keep with the root

The root retains:

- architecture and cross-cutting design;
- ambiguous, tightly coupled, or judgment-heavy coding;
- research synthesis, tradeoff analysis, and decisions;
- requirements, user interaction, scope, and authorization;
- integration and final acceptance.

Small mechanical edits normally stay with the root because spawning and checking
an agent can cost more than making the edit in the existing context.

## Delegation eligibility

Delegate only when every condition holds:

1. A less expensive available model is expected to perform the task with
   reliability comparable to the root model.
2. The task contains enough substantive work to amortize preparing the brief,
   supplying context, coordinating the run, and verifying the result under the
   conservative estimate below.
3. The outcome, scope, acceptance criteria, and stopping point can be stated
   precisely.
4. The result has an independent verification channel that is materially cheaper
   than performing the task directly.
5. The task can be completed within the user's existing authorization and, for
   writes, within an exclusive file scope that does not overlap another agent.

If any condition fails, keep the work with the root or first split it into a
larger independently useful and verifiable work packet. Do not fragment work into
tiny delegated steps.

Prefer substantive packets with settled behavior:

| Eligible when the cost gate passes | Keep with the root |
|---|---|
| Implement an agreed contract using an existing repository pattern | Discover or decide the contract while implementing |
| Migrate fixtures or callers using explicit rules | Resolve cross-component ownership or behavior |
| Add tests for specified observable outcomes | Decide what correct behavior should be |
| Execute a substantial verification procedure and return evidence | Investigate an ambiguous failure across components |

A single file is not necessarily bounded: retention, retries, focus and async
lifetime behavior can make a local control judgment-heavy. Small edits and single
test commands usually fail the overhead gate.

## Model and effort selection

Default to Luna (`gpt-5.6-luna`) at medium effort for eligible, well-defined
implementation and test packets; use low effort for mechanical execution. This
is a calibration default, not proof of reliability for every coding task or a
requirement to delegate. If Luna is unavailable or insufficient, reconsider
keeping the packet with the root before selecting another cheaper model. Record
the reason for an alternative and reapply the cost gate.

- Use low effort for deterministic commands, inventories, straightforward
  extraction, and other mechanically checkable work.
- Use medium effort for bounded research, codebase mapping, and clear multi-step
  work.
- Escalate only when the task actually requires deeper inference, difficult edge
  cases, or broad integration judgment. If it requires root-level judgment, keep
  it with the root instead of delegating by default.

Do not assume a built-in agent such as `explorer` is inexpensive. Unless its
model and effort are configured or supplied explicitly, it can inherit the
parent's settings. Select model and effort explicitly when the savings matter.

## Conservative cost estimate

Do not retrieve current token rates for every delegation decision. For routine
decisions, use the relative cost tiers already known in the session or
configuration. Consult current rates only when a model or tier is unknown, the
candidate task is large or borderline, or the policy is being deliberately
recalibrated. Small rate changes should not reverse an ordinary decision.

Compare plausible ranges rather than pretending to know exact token use:

```text
direct cost = root execution
delegated cost = root briefing and context + subagent execution and report
               + root verification and synthesis + failure/recovery allowance
```

Count duplicated context, tool work, retries, and expected outputâ€”not only the
nominal model rate. Delegate only when the plausible upper bound of delegated
cost is comfortably below the plausible lower bound of direct cost. As a
practical default, `delegated upper bound <= 70% of direct lower bound` is a
clear advantage; treat the threshold as a conservative heuristic, not a precise
accounting result. If the ranges overlap or cannot be estimated with confidence,
keep the work with the root.

## Usage preflight and interruption recovery

Before launching a delegation batch, use the available usage-limit tool (in
Codex desktop, `get_usage_limits`) and record the timestamp, relevant remaining
capacity and reset time. Recheck after a limit failure or substantial intervening
work, not every small follow-up. Limits are account-wide and shared with root
work; percentages do not translate reliably into a packet token budget.
Unavailable limits mean unknown capacity, not zero or unlimited capacity.

If capacity is nearly exhausted, or unknown for a substantial packet that needs
uninterrupted execution, do not launch it as-is. Keep it with the root if feasible,
choose a smaller independently useful packet, or report that work must wait.
Do not automatically consume resets, purchase credits or schedule a later run.

For meaningful recovery cost, require an early coherent checkpoint: save usable
artifacts and a short note listing completed checks, unchecked work and the next
action. Assign that note an exclusive path in the brief. Update at meaningful
boundaries; a final report may never arrive after an abrupt interruption. Include
checkpoint/recovery overhead in the cost estimate. Checkpoints reduce lost work;
they do not prevent limits or guarantee savings.

After interruption, inspect the checkpoint and actual artifacts before choosing
resume, local completion or waiting. Reapply the cost gate to the remaining work;
never automatically restart from scratch. Record recovery attempts under the
original entry. Confirm the old agent has stopped writing before transferring
ownership.

## Brief contract

Every delegation brief must include:

- the concrete outcome and requested deliverable;
- the task ledger path and entry id, plus any assigned checkpoint-note path;
- only the context needed to do the task;
- explicit read scope and, if applicable, exclusive write paths;
- acceptance criteria and a stopping condition;
- the independent check the root plans to perform;
- evidence the agent must return, including exact artifact paths, commands and
  results, source links or code locations, and relevant counts or hashes;
- an instruction to report missing context, uncertainty, and disagreements with
  the specification or oracle instead of guessing or tuning to match it;
- a concise output budget;
- explicit exclusions for unrelated edits, commits, pushes, pull requests,
  external messages, destructive actions, or other unrequested side effects.

For shared-workspace writes, state which files belong exclusively to the agent
and which files remain root-owned. Preserve pre-existing user changes. Never ask
an agent to stash, reset, discard, or absorb unrelated work.

## Return contract

Require this compact final report:

```markdown
## Result
- status: success | partial | blocked
- deliverable: <path, commit, structured result, or none>
- scope completed: <concise bullets>
- verification run: <exact commands/checks and observed results>
- evidence for root check: <paths, references, counts, hashes, or source links>
- deviations or disagreements: <none or details>
- remaining issues: <none or details>
- root action needed: <none or one concrete action>
```

A completion notification without the deliverable and evidence is incomplete.
Request the missing report or inspect the persisted artifacts; do not infer
success from silence or a one-word status.

## Root verification

Verify load-bearing claims through the predefined cheapest direct channel, such
as a targeted test, a focused diff inspection, a count, a hash, a source check,
or direct observation of the requested behavior. Self-attestation and a second
agent's agreement are not independent proof by themselves.

If adequate verification would require repeating most of the delegated task,
stop treating the result as verified. The work packet failed the eligibility
test; keep that class of task with the root or redesign its acceptance evidence
before delegating it again.

Use a separate reviewer only when consequence and residual uncertainty justify
its additional cost. Review does not automatically require the strongest model;
use the least expensive model capable of evaluating the particular risks. Keep
architectural and other judgment-heavy review with the root.

## Task-local diagnostics and closure

For tasks with delegation, keep one compact root-owned ledger beside the execution
plan as `<plan-stem>-delegation-log.md`, or under
`docs/research/<task-id>-delegation-log.md` when there is no plan. Reuse it across
continuations; do not create a global log or modify user memory. Agents report
evidence and write only assigned checkpoint notes; the root alone updates the
ledger. A user read-only constraint overrides file creation: carry the same
ledger in context and explicitly preserve it through handoffs.

Enforce these checkpoints:

1. **Before dispatch:** create an entry with settled contract, scope, model/effort,
   cost rationale, usage preflight and planned independent check. Reference its
   id in the brief; record the returned agent id.
2. **Before accepting delivery:** record evidence, root corrections, repeated
   checks, interruptions/recovery and verdict. An unfinished entry is not
   administratively closed even when its code has been accepted.
3. **Before compaction or handoff:** carry the ledger path and open entry ids into
   the handoff. On resumption read them before launching or resuming work.
4. **Before task closure:** reconcile entries with actual launches, including
   failed launches and follow-ups. Account for every attempt; label reconstructed
   history retrospective rather than inventing an earlier estimate.

Update this compact entry rather than appending a narrative diary. Leave outcome
fields pending until observed:

```text
id / agent id / status: <planned | running | verified | interrupted | closed>
task class and settled contract: <implementation | tests | mechanical | research; outcome>
root -> subagent: <models and efforts>
scope / artifacts / checkpoint: <paths>
expected advantage: <clear | borderline; direct versus delegated effort rationale>
usage preflight: <timestamp; relevant remaining capacity/reset or unavailable>
planned independent check: <focused check>
outcome / evidence: <success | partial | blocked; paths, commands and results>
root rework: <none | small | substantial; concrete corrections>
verification: <cheap | moderate | task effectively repeated; duplicated work>
interruptions / recovery: <attempts, saved progress and ownership transfer>
measured usage: <available measurements with attribution, or unknown>
verdict: <good delegation | false economy | inconclusive; reason>
```

The pre-dispatch rationale must include briefing/context, verification and
recovery overhead. Prefer observed rework and retries over invented token counts.
Unknown actual usage permits qualitative assessment, but successful delivery or
a preflight percentage change is not measured cost savings.

For borderline candidates retained by the root, record only a useful calibration
reason; do not log routine non-delegation choices. At task completion report the
number and outcomes of delegations, false economies and underestimated overhead.
Suggest at most one policy adjustment, supported by repeated evidence rather
than a single result.

## Concurrent work

Parallelism is not an independent reason to delegate. If the user explicitly
requests concurrent work or multiple already-eligible tasks happen to run
together, give every writing agent disjoint ownership and serialize overlapping
files, shared manifests, generated identifiers, exclusive tools, and final
integration.
