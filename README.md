# chekr

**AI output alignment checker** — enforce your design system and architectural contracts with plain JavaScript rules.

chekr is a pipeline step between AI-generated code and commit. It catches violations ESLint cannot: raw design tokens, wrong component usage, import boundaries, and project-specific patterns.

```
AI generates code
  → ESLint     syntax & style
  → chekr     design & architecture contract   ← this tool
  → Tests      behavior
  → Commit
```

## Install

```bash
npm install -g @chekr/cli
# or as a dev dependency
npm install -D @chekr/cli
```

Requires **Node.js 18+**.

## Quick start

```bash
# Scaffold rules and config in your project
chekr init

# Run all checks
chekr run

# Only changed files (git)
chekr run --changed

# JSON report for CI
chekr run --reporter json --report ./chekr-report.json
```

Your project layout:

```
your-app/
  chekr.config.js          # optional — sensible defaults without it
  .chekr/
    checks/
      check_raw_colors.js   # your rules
      check_raw_sizes.js
    fixes/
      fix_raw_sizes.js      # optional auto-fixers
```

### Minimal rule

```js
// .chekr/checks/check_raw_colors.js
export function checkRawColors(source, filePath) {
  const violations = [];
  for (const [i, line] of source.split("\n").entries()) {
    if (/#[0-9a-fA-F]{6}/.test(line)) {
      violations.push({
        file: filePath,
        line: i + 1,
        text: line.trim(),
        message: "Raw hex color — use a design token",
      });
    }
  }
  return violations;
}
```

### Config with types

```js
// chekr.config.js
/** @type {import('chekr').ChekrConfig} */
export default {
  checksDir: "./.chekr/checks",
  gitignore: ".gitignore",
  ignoreMarker: "@chekr-ignore",
  steps: [
    { id: "check_raw_colors", step: 1 },
    { id: "check_raw_sizes", step: 2 },
  ],
};
```

Install types for editor support: `npm install -D @chekr/types`

### Flexible & Professional Reporting

chekr provides a relational reporting system that allows rules to report complex, multi-file violations with deep context.

```js
export function myCheck(source, filePath, context) {
  // Use the report hook for high flexibility
  context.report({
    message: "Architectural violation",
    impact: "This increases bundle size and coupling",
    severity: "error",
    logicalId: "arch:boundary", // Group multiple violations together
    data: { customField: "metadata" },
    occurrences: [
      { file: "other_file.ts", context: "Related code found here" }
    ]
  });
}
```

## CLI

| Command | Description |
|---------|-------------|
| `chekr run` | Run checks (default command) |
| `chekr list` | List discovered rules |
| `chekr validate` | Validate rule file contracts |
| `chekr init` | Create `.chekr/` scaffold |
| `chekr fix` | Auto-fixers *(planned)* |

Common flags: `--changed`, `--staged`, `--no-bail`, `--skip`, `--only`, `--gitignore`, `--reporter json`.

See [CLI reference](docs/CLI.md).

## Packages

Only **two packages** are published to npm:

| Package | Install | Purpose |
|---------|---------|---------|
| `@chekr/cli` | `npm i -D @chekr/cli` | `chekr` command + bundled engine & rule utilities |
| `@chekr/types` | `npm i -D @chekr/types` | TypeScript definitions for `chekr.config.js` |

Installing `@chekr/cli` also places `@chekr/core`, `@chekr/helpers`, and `@chekr/utils` in `node_modules` (bundled, not separate registry packages). Rule files can import from `@chekr/utils` as documented.

### Programmatic usage

```js
import { run } from "@chekr/cli/engine";

const result = await run({
  cwd: process.cwd(),
  bail: false,
  reporter: "json",
});

console.log(result.passed, result.violations.length);
```

## Documentation

| Doc | Audience |
|-----|----------|
| [Configuration](docs/CONFIG.md) | `chekr.config.js`, per-step overrides, gitignore |
| [CLI](docs/CLI.md) | Commands and flags |
| [Rule authoring](docs/RULE_AUTHORING.md) | Writing checks and fixes |
| [Publishing](docs/PUBLISHING.md) | First npm publish |
| [Contributing](docs/CONTRIBUTING.md) | Development setup |

Internal specs: [docs/internal/](docs/internal/)

## Examples

- [`examples/minimal/`](examples/minimal/) — smallest working project
- [`examples/symphony-rules/`](examples/symphony-rules/) — advanced rules (reference only)

## Why not ESLint?

ESLint excels at syntax and universal style. chekr excels at **your** contract — token names, component hierarchies, folder import rules — in ~20 lines of plain JS per rule, without AST plugin boilerplate.

## License

MIT — see [LICENSE](LICENSE).
