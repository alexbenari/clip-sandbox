# Feature Spec: Agent Documentation Knowledge Base

## 1. Summary

Create a repo-local, agent-oriented documentation system under `docs/agent-docs/` that helps future agents orient themselves in the codebase before planning or implementing work.

The system should have:

1. one canonical entrypoint document for fast codebase orientation,
2. optional deeper design documents for subsystems or architectural areas,
3. a project-local documentation maintenance skill under `.agents/skills/`,
4. a repo `AGENTS.md` that tells future agents to use the knowledge base and respect its governance rules.

This feature is intended for agents, not humans. The design should optimize for routing, architectural intent, and low context cost.

## 2. Problem

The repo already has multiple plans and specs, but they are not reliable as the primary onboarding source for an agent because they are feature-specific, can drift from the current code, and are not structured as a compact navigation layer.

Without a canonical agent-facing knowledge base, a future agent is more likely to:

1. read too much of the codebase to orient itself,
2. miss important architectural boundaries or design rationale,
3. rely on stale historical documents,
4. propose changes that conflict with existing design decisions,
5. waste context budget reconstructing the same mental model repeatedly.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Give an agent enough orientation to know where to look without analyzing the entire repo.
2. Record the app purpose, architecture rationale, code-design axioms, and important decisions so future work respects them.
3. Keep the canonical entrypoint compact enough for efficient loading into an agent context window.
4. Support a small knowledge base rather than a single oversized document.
5. Provide clear navigation with a table of contents and cross-references.
6. Establish a maintenance workflow that keeps the knowledge base current as the code evolves.
7. Allow stale deeper docs in the knowledge base to be updated, obsoleted, or removed as needed.
8. Make architecture/design axioms normative by default: agents may challenge them only with good reason and only after user approval.

### 3.2 Non-Goals

1. This feature does not attempt to make all existing `docs/specs/` and `docs/plans/` current.
2. This feature does not use Showboat as the primary documentation format.
3. This feature does not require a generated evidence appendix or linear walkthrough artifact.
4. This feature does not attempt to document every module in the repo in exhaustive detail.
5. This feature does not make the knowledge base primarily human-facing.

## 4. Knowledge Base Structure

The knowledge base will live under one root:

- `docs/agent-docs/`

Initial required contents:

1. `docs/agent-docs/agent-architecture-map.md`
   The canonical entrypoint and first document an agent should read for orientation.
2. optional deeper documents under `docs/agent-docs/`
   These may live directly in the root or in subdirectories when grouping improves clarity.

The folder structure should remain pragmatic. Subdirectories are allowed when they improve organization for a specific document set, but directory structure should not become deep or ceremonial.

## 5. Core Concepts

### 5.1 Canonical Entry Point

`agent-architecture-map.md` is the authoritative starting point for agent orientation. It should be the first document an agent reads before planning substantial work.

Its purpose is to:

1. explain what the app does,
2. explain the major architectural boundaries,
3. identify the most important modules and flows,
4. route the agent toward the right files and deeper docs,
5. encode the architecture and code-design rules that should be preserved.

### 5.2 Deeper Documents

Deeper documents are subordinate to the canonical entrypoint and exist only when they add clear value.

They should:

1. cover a bounded subsystem, workflow, or architectural topic,
2. be linked from the main map when relevant,
3. link back to the main map when useful,
4. remain compressed and practical rather than encyclopedic.

### 5.3 Architecture and Code-Design Axioms

The knowledge base should distinguish between:

1. descriptive material: how the code currently works,
2. normative material: architecture and code-design axioms or decisions that future changes should respect.

Normative guidance should be explicit. An agent may challenge it only when it has concrete justification and only after user approval.

### 5.4 Documentation Maintenance Skill

A project-local skill under `.agents/skills/` will define how documentation in `docs/agent-docs/` is maintained.

This skill is the workflow source of truth for:

1. updating the canonical map,
2. updating deeper docs,
3. validating references against current code,
4. pruning obsolete content,
5. deciding when a code change should also trigger documentation updates.

### 5.5 Repository AGENTS.md

A repo `AGENTS.md` should instruct future agents to:

1. consult the canonical architecture map before planning substantial work,
2. treat the architecture axioms and decisions as normative unless the user approves a challenge,
3. keep the knowledge base current when architecture or code-design changes would otherwise make it stale,
4. prefer the knowledge base over historical specs/plans for architecture orientation.

## 6. Functional Requirements

### 6.1 Canonical Map Requirements

`docs/agent-docs/agent-architecture-map.md` must:

1. have a short table of contents near the top,
2. explain the app’s purpose and operating model,
3. explain the current architecture in terms of major layers, responsibilities, and ownership boundaries,
4. include architecture and code-design axioms near the top of the document,
5. identify key runtime flows and route readers to the relevant files,
6. identify the most important modules to read first,
7. include cross-references to deeper docs when they exist,
8. include a test map or test-guidance section that helps agents know where to validate changes,
9. include freshness metadata such as last verification date and/or verification scope,
10. stay as short as possible but not shorter than is useful for reliable orientation.

The canonical map must optimize for navigation and orientation, not exhaustive narration.

### 6.2 Deeper Document Requirements

Deeper docs in `docs/agent-docs/` must:

1. cover a specific subsystem, flow, or architectural topic,
2. include enough context to be useful when opened independently,
3. avoid duplicating the entire canonical map,
4. stay compressed but not so compressed that they become vague,
5. clearly indicate when they are normative versus descriptive,
6. be removable or markable as obsolete when they no longer reflect current code.

### 6.3 Cross-Reference Requirements

The knowledge base must use cross-references intentionally.

Required cross-reference behavior:

1. the main map links to relevant deeper docs,
2. deeper docs link back to the main map when useful,
3. sections should link to the most relevant code files,
4. historical plans/specs should not be presented as canonical orientation material,
5. if historical docs are referenced, they should be clearly labeled as historical context rather than current architecture truth.

### 6.4 Governance Requirements

The knowledge base must encode governance for future agents.

Required governance rules:

1. architecture and code-design axioms are the default constraints for future work,
2. agents may challenge those axioms only with a concrete reason,
3. changing or breaking a normative design decision requires user approval,
4. documentation that becomes stale due to architecture or code-design changes should be updated as part of the same work when practical,
5. obsolete docs in the knowledge base may be updated, marked obsolete, or removed by the maintenance workflow.

### 6.5 Maintenance Skill Requirements

The project-local documentation maintenance skill must:

1. live under `.agents/skills/`,
2. define when it should be used,
3. define the update workflow for `docs/agent-docs/`,
4. instruct the agent to validate claims against current code before editing docs,
5. instruct the agent to preserve context efficiency,
6. instruct the agent to update cross-references and freshness metadata,
7. instruct the agent to remove or obsolete stale deeper docs when appropriate,
8. instruct the agent to flag when a code change should not be considered complete until the knowledge base is updated.

The skill should be repo-specific and lightweight enough that invoking it does not create unnecessary context overhead.

### 6.6 AGENTS.md Requirements

The repo `AGENTS.md` must:

1. point future agents to `docs/agent-docs/agent-architecture-map.md` for orientation,
2. instruct agents to use the documentation maintenance skill when architecture/design docs need updates,
3. state that the knowledge base is the canonical agent-facing architecture resource,
4. clarify that historical plans/specs are not the primary source of truth for current architecture orientation,
5. state that architecture and code-design axioms may only be challenged with user approval.

## 7. Content Design for the Canonical Map

The initial canonical map should likely contain sections similar to:

1. purpose of the app,
2. architecture and code-design axioms,
3. high-level system shape,
4. major runtime flows,
5. where to look for each concern,
6. tests and validation routes,
7. extension points and risky seams,
8. linked deeper docs,
9. freshness / verification notes.

This section list is directional rather than prescriptive, but the final result must remain optimized for quick orientation.

## 8. Staleness Strategy

The knowledge base is expected to evolve alongside the codebase.

Staleness strategy requirements:

1. the canonical map should be maintained as the current entrypoint,
2. deeper docs should exist only while useful and accurate,
3. the maintenance workflow may remove or obsolete stale deeper docs,
4. documentation updates should be considered part of architecture-affecting work,
5. the repo should make it clear which docs are canonical and which are historical.

## 9. Acceptance Criteria

This feature is complete when:

1. `docs/agent-docs/` exists,
2. `docs/agent-docs/agent-architecture-map.md` exists and functions as a compact orientation entrypoint,
3. the main map includes architecture/code-design axioms and routing guidance to the most important files,
4. the main map includes a TOC and meaningful cross-references,
5. a repo-local documentation maintenance skill exists under `.agents/skills/`,
6. the maintenance skill defines how to update, prune, and govern the knowledge base,
7. a repo `AGENTS.md` exists and points future agents to the knowledge base and the maintenance workflow,
8. the knowledge base is positioned as canonical for agent architecture orientation,
9. the implementation does not depend on Showboat.

## 10. Open Questions Resolved in This Spec

1. Primary format:
   Resolved to a canonical architecture map plus optional deeper docs, not a Showboat-first walkthrough.
2. Knowledge-base location:
   Resolved to `docs/agent-docs/`.
3. Governance:
   Resolved that architecture/code-design axioms are normative and require approval to challenge.
4. Maintenance mechanism:
   Resolved to a project-local documentation update skill, implemented as part of this work.
5. AGENTS integration:
   Resolved that a repo `AGENTS.md` should be created as part of this work.
6. Stale docs handling:
   Resolved that the maintenance workflow may update, obsolete, or remove stale docs in the knowledge base.
