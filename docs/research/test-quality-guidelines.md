# Test quality guidelines (draft)

Status: draft for review. Derived from the 2026-10-17 test-quality review of
master (15 findings) and revised while fixing them. Where these rules end up
(a test-writing skill, `coding-quality.md`, the code-quality review) is still
to be decided.

## Why the problems happened

1. **Tests were written from the code, not the requirement.** Authors asserted
   what the code happens to do: `appendChild` called once, hidden-grid styles,
   toast durations, encoder flags, the 50-entry history cap.
2. **No test was seen failing for the right reason.** Seven tests could not
   fail: one asserted its own fixture, one compared `indexOf` results that are
   -1 when a phase is missing, one compared invocation order of two calls on one
   mock, one could not tell reapplying from skipping, one never sent the command
   its name was about.
3. **Flaky tests were patched until they passed instead of repaired.** One e2e
   test lost its whole scenario but kept its name; tolerances were widened to
   cover every possible value.
4. **Some checks depended on a tool no gate runs.** Type-contract tests need
   `tsc`; pre-commit and CI ran only `unit` and `e2e`.
5. **There was no shared model of async completion.** Negative checks ran
   right after async actions, layout was measured before a resize landed, fixed
   sleeps were sized to private constants, polling raced a moving clock.
6. **Tests shared machine state and environment.** A cache in the repository
   folder was dodged with random media; temp folders and native hosts leaked;
   missing native tools made some specs skip, some throw, one fail at load.
7. **Recorded behavior was treated as correct.** "Restored 1 saved ranges."
   became an expected string.
8. **Names and structure did not follow refactors.** Describe names referred
   to finished projects, grab-bag files duplicated each other, hand-copied DOM
   fixtures drifted from `index.html`.

Underneath all eight: most rules already existed (`coding-quality.md` § Test
reliability, the `testing-discipline` skill) as principles, with nothing that
made anyone show they were followed.

## Guidelines

### A. What to assert

1. **Name the requirement first.** Write one sentence saying what the user or
   caller relies on. The assertion checks that sentence, not how the code
   produces it.
2. **Do not pin incidental values.** Durations, retry counts, buffer sizes,
   encoder settings, CSS details, DOM structure, call counts and call order are
   off-limits unless the spec states them. When a value matters, take it from the
   production constant or the spec, and never use it to find other things (no
   `timeout === 5000` filters).
3. **Assert outcomes, not interactions.** Check state, output or what is
   visible. Assert a mock interaction only when the interaction is the contract,
   such as "never calls the service with a path".
4. **Assert on the system under test, never on the fixture.** Every expectation
   must read something the code produced or changed.
5. **Be precise.** Use exact expected values for concrete inputs. Ranges that
   cover every possibility, `toContain('16')` on an argument list and `toThrow()`
   without a message do not count as assertions.

### B. Proving the test can fail

6. **Watch it fail for the right reason.** Where you can, write the test first
   and see it fail. That is not enough when it fails only because the code
   does not exist yet, and it is impossible for tests of existing code
   (characterization, e2e of shipped behavior, repairs to a test). In those
   cases break the specific behavior the test names and confirm it fails with a
   readable message. Say which mutation you tried in the commit message when
   the test guards a subtle property (ordering, caching, concurrency, cleanup).
   For an e2e test, also
   confirm the scenario actually reaches the state its name describes; if the
   fixture cannot, prove the property at a lower level and name the e2e for
   what it reaches.
7. **Make negative tests force the opportunity.** "X does not happen" must
   first create the conditions where X would happen and must wait until X would
   have been observable. Checking immediately proves nothing. Writing the test
   first does not help here: with no code, nothing happens, so the test passes.
8. **Make ordering tests hold the first step.** Use a deferred promise so the
   second step can only start after the first finishes if the code really is
   sequential.
9. **Make the name and body agree.** Every clause in a test name needs an
   action and an assertion in the body. If the body changes, fix the name or
   split the test.
10. **Assert at the moment the API promises the effect.** Check right after
    the awaited call that promises it (for example `await dispose()`), before
    awaiting other work that could complete the effect and hide an ordering
    bug.

### C. Async and timing

11. **No fixed sleeps, and no waits sized to private constants.** Use fake
    timers for timer logic; use an observable completion signal for real async
    work.
12. **Wait for the precondition, and confirm setup took effect.** After a
    resize, navigation or mode change, wait for evidence it took effect before
    reading layout; a setup call can silently do nothing (a maximized window
    ignores a resize). Prefer Playwright's retrying `expect(locator)` matchers
    over `expect(await locator.x())`.
13. **Do not poll a moving clock.** Make the system still, make the
    expectation relative to a value captured at the action, or record the event
    through a test hook.
14. **Do not count microtasks.** Flush fully or wait on a condition instead of
    `await Promise.resolve()` repeated N times.

### D. Isolation and environment

15. **Every test owns its state.** Temp folders, profiles and caches live under
    the test's own root, are removed in `finally`/`afterEach`, and never land in
    the repository. When the app itself writes elsewhere, give it a test-mode
    location under the test's root rather than cleaning up after it. Global
    patches (`Math.random`, prototypes, `URL`, `ResizeObserver`) are restored in
    `finally`/`afterEach`, saving the original before replacing it.
16. **No randomness to dodge state.** If a test needs a fresh environment, give
    it one.
17. **Handle a missing environment the same way everywhere, and assume no
    machine.** Optional native dependencies use one shared skip guard,
    evaluated before anything that can throw. Never resolve tools at module
    load. Never assume a display size: derive pointer targets from element
    boxes.
18. **Use the real markup and honest stubs.** Integration tests build the DOM
    from `index.html` or the control's own factory, never from a hand-copied
    page skeleton. A stub must honour the inputs that matter to the behavior
    under test, or the test should use the real collaborator.

### E. Flaky tests and gates

19. **A flaky-test fix has three allowed outcomes:** make it deterministic; move
    the timing-sensitive part to a level where timing can be controlled; or delete
    the test and record the coverage gap. Never weaken the scenario, widen a
    tolerance just to pass, or keep the name over a hollowed body. The commit
    message says which outcome was taken.
20. **Every kind of check must run in a gate.** If a test relies on `tsc`, a
    native build or a fixture generator, that tool runs in pre-commit or CI, or
    the test does not count as coverage.
21. **Review recorded expectations before freezing them.** For each recorded
    string or behavior, either confirm it is the requirement or fix the bug.

### F. Structure and naming

22. **One behavior per test; e2e only for essential workflows.** An e2e test
    follows one user workflow through real controls. Do not inject DOM nodes or
    dispatch synthetic events to reach a state the user cannot reach. Detailed
    rules belong in unit or integration tests.
23. **Names describe behavior.** A file is named after the unit it tests; a test
    after the scenario and its expected outcome. No project-history names. When a
    production class is renamed or split, rename its tests in the same change.
24. **One home per behavior.** Search for an existing test before adding one.
    Shared builders live in `tests/support/`, not copy-pasted per file.

### G. Questions for code review

- Which requirement sentence does each test protect, and does the name say it?
- What one-line bug would make this test fail? Was that checked?
- Is any expected value a private constant or an implementation detail?
- Does any assertion read the fixture instead of the system under test?
- For async or negative tests: what proves the system has settled?
- Does the test leave anything behind or depend on anything outside its setup?
- If this commit fixes a flaky test, does the scenario still match the name, and
  which of the three outcomes was taken?
- Does each test run in a gate that actually executes it?
- Before calling an assertion vacuous or a value incidental, did you check the
  fixture and the spec?

## Revisions made while fixing

Fixing the 15 findings turned up the following. Each item says which
guideline it changes or adds.

1. **An e2e test can pass a mutation because it never reaches its state**
   (extends 6). The restored close-during-extraction test still passed with
   workspace cleanup broken: the 3-second fixture finishes encoding before the
   close lands, so the workspace never existed. New rule: when you break the
   code for an e2e test, confirm the scenario reaches the state its name
   describes; if the fixture cannot, prove the property at a lower level and
   name the e2e for what it does reach.
2. **Assert at the moment the API promises the effect** (new rule 10). The
   disposal unit test awaited the extraction before checking that the
   workspace was removed, so it could not tell whether `dispose()` itself
   waited for cleanup. Check right after the awaited call that promises the
   effect, before awaiting anything else.
3. **Confirm setup took effect** (extends 12). `setContentSize` on the
   maximized window did nothing, and the shell test ran at full size for its
   whole life. Assert the precondition (window size, cache state, fixture
   contents) instead of assuming the setup call worked.
4. **Synthetic paths test a different branch than users reach** (evidence for 22). With a fake Refine option and no movie open, Back took focus; through
   the real Refine button the player takes focus. The test had pinned the
   fallback branch as if it were the behavior.
5. **Copied fixtures hide real behavior** (evidence for 18, extends it).
   Building the app from the real `index.html` showed a test that only passed
   because the copy lacked the global utility host: Activity does not open
   over Zoom. A stub that ignores its inputs has the same effect (the
   collection-choice stub ignored the active collection). New rule: stubs must
   honour the inputs that matter, or use the real collaborator.
6. **Never assume a display size** (extends 17). Pointer moves to fixed
   screen coordinates made a full-screen test fail intermittently on this
   machine. Derive pointer targets from element boxes.
7. **Give the app a test location instead of cleaning up after it** (extends 15). Every native e2e test shared prepared-review caches in the repository
   folder, so cold and warm behavior depended on the machine's history. The
   app now keeps those caches in the test profile in e2e mode.
8. **Verify review claims against the fixture** (new review question in G). One
   finding said a range assertion "accepts every possible value"; the movie
   has five frames, so it excluded one. The fix stood, but the claim was
   wrong. A reviewer should check a test's fixture before calling an
   assertion vacuous.

Not fixed, outside test scope: `electron/main.cjs` parses
`resolved-dependencies.json` without stripping a BOM, which AGENTS.md
requires of readers of generated JSON (`NativeProductLocator` does strip it).
