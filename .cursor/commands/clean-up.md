# Clean up — full quality gate

Run the monorepo quality pipeline end-to-end. **Do not stop until every step passes.** Fix issues at the source — no suppressions, no shortcuts.

Read and follow **AGENTS.md** and use skill **`.cursor/skills/code-review-and-quality/SKILL.md`** while fixing.

---

## Pipeline (strict order)

Execute each step from the **repo root**. Re-run a step after fixes until it exits **0**.

### Step 1 — Violations

```bash
bun run check-violations
```

- **Fix every violation** reported by the toolkit checks.
- Re-run until output is clean (no failures).
- Do not add `eslint-disable`, `@ts-ignore`, or toolkit suppressions unless the violation is genuinely a false positive — and document why in your summary if you must.
- Use existing fix scripts under `toolkit/scripts/` when applicable.

### Step 2 — Tests

```bash
bun run test
```

- **All tests must pass.**
- Fix failing tests by correcting code or updating tests when behavior intentionally changed.
- Do not delete or skip tests to green the run.

### Step 3 — Typecheck

```bash
bun run typecheck
```

- **Zero TypeScript errors** across the monorepo.
- Apply **real fixes**: correct types, narrow unions, fix imports, align props/interfaces.
- **Forbidden shortcuts:**
  - `as any`, `as unknown as X`
  - `@ts-expect-error` / `@ts-ignore` to silence errors
  - Widening to `unknown` or `any` to make the compiler quiet
- Re-run until `typecheck` is fully clean.

### Step 4 — Build

```bash
bun run build
```

- **Build must succeed** for all turbo build tasks.
- Fix compilation, config, and dependency issues surfaced by the build.
- Re-run until build completes with exit code **0**.

---

### Step 5 — React Native JS bundle check

If the repo contains either of these directories:

* `apps/native`
* `apps/mobile`

then treat the codebase as containing a React Native app and run an Expo export check.

From the React Native app directory, run:

```bash
bunx expo export --platform android
```

* This step must pass with exit code **0**.
* Fix any JS bundling, import, asset, config, or Expo-related issues.
* Re-run until the export succeeds.
* If neither `apps/native` nor `apps/mobile` exists, mark this step as **SKIPPED** in the final report.

---

## Shell rules

- Prefer **CMD** over PowerShell; one command at a time (no `&&` chains).
- Use **bun** / **bunx** only.
- If a step needs multiple commands, write a script in `scratch/`, run it, delete when done.

---

## Completion criteria

| Step | Must be |
|------|---------|
| `check-violations` | 0 violations |
| `test` | All passing |
| `typecheck` | 0 errors |
| `build` | Success |

---

## Final report

When done, reply with:

1. **Checklist** — each step PASS/FAIL
2. **Files changed** — grouped by step
3. **Notable fixes** — 3–5 bullets
4. **Remaining risks** — anything you could not verify (or "none")

Do not claim completion if any step still fails.
