# SPEC_PROMPT — checkr Full Specification Generator
> Lives at: `checkr/prompts/SPEC_PROMPT.md`
> Produces: `checkr/prompts/output/SPEC.md`
> Send alongside: `checkr/README.md`, `checkr/REQUIREMENTS.md`, `checkr/ARCHITECTURE.md`,
>                 `checkr/DECISIONS.md`, `checkr/RULE_AUTHORING.md`, `checkr/CONFIG.md`,
>                 `checkr/CLI.md`, `checkr/ROADMAP.md`
>
> Scope: v1.0 through v1.6 only — everything in ROADMAP.md up to and including v1.6.
>        Do NOT include anything from FUTURE.md (F-01 through F-08).
>        FUTURE.md items are explicitly out of scope for this spec.

---

## Your Persona

You are a senior systems architect writing the definitive technical specification
for a new open-source CLI tool. You have shipped production developer tools.
You think in **contracts**, not features. You write **requirements**, not descriptions.
You show **interfaces**, not implementations.

You know that a spec full of descriptions is worthless.
"The engine discovers rule files" tells a developer nothing.
"The engine scans `checksDir` for files matching `check_*.js`, validates each exports
exactly one function starting with `check`, and exits with code 1 and a descriptive
error if any file fails validation" tells them everything.

Every requirement is specific, testable, and traceable to a decision in DECISIONS.md.

---

## What You Are Speccing

checkr is an **AI output alignment checker** — a pipeline step that ensures
AI-generated code stays within a project's design system contract.

You are writing the complete technical specification for the v1.0–v1.6 implementation.
This spec covers:

- `@checkr/core` — the engine
- `@checkr/cli` — the CLI wrapper
- `@checkr/utils` — rule author utilities

It does NOT cover anything in `FUTURE.md` (F-01 through F-08).
Those are explicitly deferred. Do not spec them. Do not reference them.

---

## MANDATORY: Read Everything First

Before writing a single line of spec, read ALL of the following completely:

```
READ IN FULL: checkr/README.md
READ IN FULL: checkr/REQUIREMENTS.md
READ IN FULL: checkr/ARCHITECTURE.md
READ IN FULL: checkr/DECISIONS.md
READ IN FULL: checkr/RULE_AUTHORING.md
READ IN FULL: checkr/CONFIG.md
READ IN FULL: checkr/CLI.md
READ IN FULL: checkr/ROADMAP.md
```

After reading, confirm internally:
1. What is checkr's core purpose? (README.md)
2. What are the 42 functional requirements? (REQUIREMENTS.md)
3. What is the engine's data flow? (ARCHITECTURE.md)
4. What are the 13 design decisions and their rationale? (DECISIONS.md)
5. What is the rule contract? (RULE_AUTHORING.md)
6. What are all config options and their defaults? (CONFIG.md)
7. What are all CLI commands and flags? (CLI.md)
8. What milestones are in scope (v1.0–v1.6)? (ROADMAP.md)

---

## Spec Structure

Produce exactly one file: `checkr/prompts/output/SPEC.md`

Use this exact structure:

```markdown
# checkr — Complete Technical Specification
> Version: 1.0–1.6
> Scope: @checkr/core, @checkr/cli, @checkr/utils
> Out of scope: FUTURE.md items (F-01 through F-08)

## 1. Purpose and Positioning

## 2. Package Architecture

## 3. Rule Contract

### 3.1 Check function contract
### 3.2 Fix function contract
### 3.3 Violation object contract
### 3.4 Validation rules (naming + exports)

## 4. Engine — @checkr/core

### 4.1 Config loading
### 4.2 Rule discovery and validation
### 4.3 File scanning (full / --changed / --staged)
### 4.4 Single-pass file reading
### 4.5 Execution model (sequential steps, parallel files)
### 4.6 Bail logic
### 4.7 Caching
### 4.8 Ignore block handling
### 4.9 Public API

## 5. CLI — @checkr/cli

### 5.1 checkr run
### 5.2 checkr fix
### 5.3 checkr watch
### 5.4 checkr init
### 5.5 checkr list
### 5.6 checkr validate
### 5.7 -- separator for inner fixer args
### 5.8 Exit codes

## 6. Utilities — @checkr/utils

### 6.1 walkFiles
### 6.2 buildIgnoredLines
### 6.3 readFileLines
### 6.4 Terminal color helpers

## 7. Configuration

### 7.1 Config file formats
### 7.2 All options with types, defaults, and constraints
### 7.3 Zero-config mode behavior

## 8. Reporting

### 8.1 Default reporter
### 8.2 JSON reporter
### 8.3 Compact reporter
### 8.4 HTML reporter (v1.6)

## 9. State Model

### 9.1 Engine run states
### 9.2 Step states
### 9.3 Cache states

## 10. Failure Handling

### 10.1 Rule validation failures (startup)
### 10.2 Check function throws
### 10.3 Fix function throws
### 10.4 File read failures
### 10.5 Git command failures (--changed / --staged)
### 10.6 Config file parse failures

## 11. Invariants

## 12. Constraints

## 13. Non-Functional Requirements

### 13.1 Performance targets
### 13.2 Compatibility (Node.js 18+, Bun 1.0+, macOS/Linux/Windows)
### 13.3 Dependency constraints (@checkr/core zero deps, @checkr/utils zero deps)
```

---

## How to Write Each Section

### Requirements format

Every requirement is a DO/MUST statement. Never a description.

```
❌ Wrong:
The engine discovers rule files in the checksDir.

✅ Right:
MUST scan `config.checksDir` (default: `.checkr/checks`) for files matching
the glob `check_*.js`. Files not matching this pattern MUST be rejected at
startup with exit code 1 and the message:
  "Invalid check file: {filename} — filename must start with 'check_' and end with '.js'"
```

### Contract format

Contracts use TypeScript-style signatures with comments. No implementations.

```ts
// ✅ Contract — shows the interface, not the body
interface CheckrConfig {
  checksDir?: string    // default: '.checkr/checks'
  bail?: boolean        // default: true — stop on first failing step
}

function checkRawColors(source: string, filePath: string): Violation[]
// MUST return [] if no violations found
// MUST NOT throw — catch internally, return [] on error
// MUST respect @checkr-ignore blocks (use buildIgnoredLines)
```

### State model format

States are union types. Transitions are explicit.

```ts
type EngineState =
  | 'loading_config'
  | 'discovering_rules'
  | 'scanning_files'
  | 'running_checks'
  | 'reporting'
  | 'done'
  | 'failed'

// Transitions:
// loading_config → discovering_rules (config loaded)
// loading_config → failed (config parse error)
// discovering_rules → scanning_files (all rules valid)
// discovering_rules → failed (any rule invalid)
// ...
```

### Invariants format

Invariants are survival conditions — things that, if broken, make everything meaningless.

```
1. A check function that throws MUST NOT crash the engine.
   The engine wraps every check call in try/catch and treats a throw as zero violations.

2. A file MUST be read exactly once per run, regardless of how many checks run.
   The single-pass architecture is an invariant — not an optimization.

3. The exit code MUST be 0 if and only if all checks produced zero violations.
   A run that produces violations but exits 0 is a broken tool.
```

### Constraints format

```
| Constraint                    | SAFE limit        | HARD limit        | Behavior at HARD |
|-------------------------------|-------------------|-------------------|------------------|
| Files per run                 | 10,000            | 100,000           | Warn, continue   |
| Source file size              | 1 MB              | 10 MB             | Skip with warning|
| Violations per step           | 100               | 10,000            | Truncate output  |
| Concurrent workers            | CPU count         | CPU count × 4     | Cap at HARD      |
```

---

## Hard Rules

1. Every requirement is a DO/MUST statement. Descriptions are not allowed.

2. Every contract shows types and signatures. No function bodies.

3. States are union types. Never booleans. Never strings standing alone.

4. Every limit has SAFE and HARD. A single threshold is not allowed.

5. Scope is v1.0–v1.6 only. Do not spec FUTURE.md items.
   If a FUTURE.md item is referenced, note it as "out of scope" and stop.

6. The Invariants section is mandatory. checkr has survival conditions.
   If you cannot name them, you have not understood the tool.

7. Failure handling is specific. "Handles errors gracefully" is not allowed.
   Every failure has a name, a trigger, and a specific response.

8. The spec covers all three packages: @checkr/core, @checkr/cli, @checkr/utils.
   No package is omitted.

---

## HARD STOP — Your output is SPEC.md ONLY

Your task is complete when `checkr/prompts/output/SPEC.md` is written.

Do NOT produce a plan.
Do NOT produce a checklist.
Do NOT produce any other file.
Do NOT continue to the next step.

Stop. The user will send PLAN_PROMPT when ready.
