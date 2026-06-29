# chekr — Design Decisions

Key decisions made during design, with rationale. This is the living record of "why" — so future contributors don't re-debate settled questions.

---

## DD-01: Plain JavaScript rules, no DSL

**Decision:** Rules are plain JS/TS functions. No custom DSL, no YAML, no JSON schema.

**Rationale:** The target audience is developers who already know JavaScript. A DSL adds a learning curve with no benefit — you can express any rule in 20 lines of plain JS. The simplicity of "it's just a function" is the core value proposition.

**Rejected alternatives:**
- YAML rule definitions — too limited, can't express complex logic
- ESLint rule format — too much boilerplate, couples to ESLint's release cycle
- Custom DSL — unnecessary complexity

---

## DD-02: String-based rules, not AST-based

**Decision:** Rules operate on source strings (line by line), not AST nodes.

**Rationale:** The violations chekr catches are pattern-based, not semantic. `"16px"` is always wrong regardless of context. `<Box as="button">` is always wrong regardless of where it appears. String matching is sufficient and 10x simpler to write than AST visitors.

**Trade-off:** Some rules that require semantic understanding (e.g. "this variable is used as a color") cannot be expressed. That's acceptable — those rules belong in TypeScript's type system, not here.

---

## DD-03: File naming convention enforced by engine

**Decision:** Files must be named `check_*.js` and `fix_*.js`. The engine validates this at startup and fails loudly if violated.

**Rationale:** Convention over configuration. The naming convention makes the codebase self-documenting and enables zero-config discovery. Enforcing it at startup prevents silent failures where a misnamed file is simply ignored.

---

## DD-04: Function name derived from filename

**Decision:** The expected function name is derived from the filename. `check_raw_colors.js` must export `checkRawColors`.

**Rationale:** Eliminates a class of bugs where the file is named one thing and the function another. Makes the codebase navigable — you can find the function from the filename without reading the file.

**Implementation:** `check_raw_colors` → strip `check_` prefix → `raw_colors` → camelCase → `rawColors` → prepend `check` → `checkRawColors`.

---

## DD-05: Bail on first failure by default

**Decision:** `bail: true` is the default. The engine stops after the first step that produces violations.

**Rationale:** Matches the current Symphony toolkit behavior. In a pipeline context, fixing violations in order makes sense — later checks may produce false positives if earlier violations aren't fixed first. Developers can override with `--no-bail` when they want to see all failures at once.

---

## DD-06: Single file read pass

**Decision:** Each file is read from disk exactly once. The source is passed to all applicable checks in memory.

**Rationale:** I/O is the bottleneck. Reading 1000 files 24 times (once per check) is 24x slower than reading them once. The memory cost of holding all sources in a `Map<path, source>` is acceptable for typical codebases.

---

## DD-07: `--` separator for inner fixer args

**Decision:** Use the standard Unix `--` separator to pass arguments to individual fixers.

**Rationale:** `--` is the established convention for "end of tool flags, start of passthrough args". It's familiar to any Unix user, requires no special documentation, and avoids flag namespace collisions between chekr and the fixer.

---

## DD-08: `@chekr/utils` is zero-dependency

**Decision:** `@chekr/utils` has no npm dependencies.

**Rationale:** Rule authors import from `@chekr/utils`. If utils had dependencies, those would be transitive dependencies of every project using chekr. Keeping utils dependency-free makes the install footprint minimal and avoids version conflicts.

---

## DD-09: Not a replacement for ESLint

**Decision:** chekr explicitly does not replace ESLint. It is a complementary pipeline step.

**Rationale:** ESLint is excellent at what it does — syntax, style, common JS/TS patterns. chekr is for a different class of violations: design system contract enforcement, AI output alignment. Trying to do both in one tool would make both worse.

The positioning is: ESLint catches code quality issues, chekr catches design contract violations. They run at different points in the pipeline and serve different purposes.

---

## DD-10: Ignore blocks use a keyword, not line numbers

**Decision:** Ignore blocks use `@chekr-ignore-start` / `@chekr-ignore-end` keywords, not `// chekr-disable-next-line` or line number ranges.

**Rationale:** Block-based ignores are more robust to line number changes (refactoring, insertions). The start/end pattern is explicit about what's being ignored and why (the comment between the markers explains the reason). Single-line disables encourage lazy suppression without explanation.

---

## DD-11: Working directory is `.chekr/`

**Decision:** The default working directory for checks and fixes is `.chekr/checks/` and `.chekr/fixes/`. This replaces the previous default of `./checks/` and `./fixes/`.

**Rationale:** A dotfolder keeps the project root clean and signals that this is tooling configuration, not source code. It follows the established convention of `.github/`, `.husky/`, `.vscode/` — tooling lives in dotfolders. The `.chekr/` name is unambiguous and directly tied to the tool name.

**Structure:**
```
.chekr/
  checks/
    check_raw_colors.js
    check_raw_sizes.js
  fixes/
    fix_raw_sizes.js
  chekr.config.js       ← optional, can also live at project root
```

**Override:** The `checksDir` and `fixesDir` config options still work. Teams that prefer a different location can set them explicitly.

---

## DD-12: JS/TS only in v1.x

**Decision:** v1.x supports only JavaScript and TypeScript rule files and source files.

**Rationale:** The initial use case is AI-generated frontend code (React/TypeScript). Supporting other languages requires either a language-specific parser or a different architecture (see DD-13 in FUTURE.md). Shipping a focused, well-tested JS/TS tool is better than shipping a half-working multi-language tool.

**Future:** See `FUTURE.md` — multi-language support via independent binary is planned for v3.x (F-01).

---

## DD-13: Exactly one check/fix function per file

**Decision:** Each check file exports exactly one function starting with `check`. Each fix file exports exactly one function starting with `fix`. The engine rejects files with zero or more than one such function.

**Rationale:** "At least one" creates ambiguity — if a file exports `checkFoo` and `checkBar`, the engine doesn't know which one is the rule entry point, which one is a helper, or what order to run them in. "Exactly one" eliminates this ambiguity entirely. The engine always knows which function to call, and the rule author always knows what the engine will call.

Helper functions are still allowed — they just must not start with `check` or `fix`. This is a natural convention: public API starts with the prefix, private helpers don't.

**Error messages are explicit:**
```
❌ .chekr/checks/check_ambiguous.js — exports 2 functions starting with "check": checkFoo, checkBar
   Each check file must export exactly one check function.
```

**If you need multiple related checks:** put them in separate files. One file, one rule, one responsibility.
