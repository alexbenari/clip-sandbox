# Repository Instructions

## Planning Flow

Use this flow when the user explicitly wants to plan a new feature together.

1. Get up to speed on the user's feature description by reading the agent documentation in the Agent Documentation section first, then inspecting only the relevant code paths it points to.
2. Refine the spec with the user.
3. Once the spec is agreed, create `docs/specs/[feature-name]-spec.md` and ask the user to sign it off.
4. After spec sign-off, create `docs/plans/[feature-name]-exec-plan.md` using `C:/Users/alexb/.codex/PLANS.md` as the source of truth, then ask the user to sign it off.
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
