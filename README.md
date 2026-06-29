# checkr

**AI output alignment checker** — enforce your design system and architectural contracts with plain JavaScript rules.

checkr is a pipeline step between AI-generated code and commit. It catches violations ESLint cannot: raw design tokens, wrong component usage, import boundaries, and project-specific patterns.

```
AI generates code
  → ESLint     syntax & style
  → checkr     design & architecture contract   ← this tool
  → Tests      behavior
  → Commit
```

## Install

```bash
npm install -g @checkr/cli
# or as a dev dependency
npm install -D @checkr/cli
```

Requires **Node.js 18+**.

## Quick start

```bash
# Scaffold rules and config in your project
checkr init

# Run all checks
checkr run

# Only changed files (git)
checkr run --changed

# JSON report for CI
checkr run --reporter json --report ./checkr-report.json
```

Your project layout:

```
your-app/
  checkr.config.js          # optional — sensible defaults without it
  .checkr/
    checks/
      check_raw_colors.js   # your rules
      check_raw_sizes.js
    fixes/
      fix_raw_sizes.js      # optional auto-fixers
```

### Minimal rule

```js
// .checkr/checks/check_raw_colors.js
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
// checkr.config.js
/** @type {import('checkr').CheckrConfig} */
export default {
  checksDir: "./.checkr/checks",
  gitignore: ".gitignore",
  ignoreMarker: "@checkr-ignore",
  steps: [
    { id: "check_raw_colors", step: 1 },
    { id: "check_raw_sizes", step: 2 },
  ],
};
```

Install types for editor support: `npm install -D @checkr/types`

## CLI

| Command | Description |
|---------|-------------|
| `checkr run` | Run checks (default command) |
| `checkr list` | List discovered rules |
| `checkr validate` | Validate rule file contracts |
| `checkr init` | Create `.checkr/` scaffold |
| `checkr fix` | Auto-fixers *(planned)* |

Common flags: `--changed`, `--staged`, `--no-bail`, `--skip`, `--only`, `--gitignore`, `--reporter json`.

See [CLI reference](docs/CLI.md).

## Packages

Only **two packages** are published to npm:

| Package | Install | Purpose |
|---------|---------|---------|
| `@checkr/cli` | `npm i -D @checkr/cli` | `checkr` command + bundled engine & rule utilities |
| `@checkr/types` | `npm i -D @checkr/types` | TypeScript definitions for `checkr.config.js` |

Installing `@checkr/cli` also places `@checkr/core`, `@checkr/helpers`, and `@checkr/utils` in `node_modules` (bundled, not separate registry packages). Rule files can import from `@checkr/utils` as documented.

### Programmatic usage

```js
import { run } from "@checkr/cli/engine";

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
| [Configuration](docs/CONFIG.md) | `checkr.config.js`, per-step overrides, gitignore |
| [CLI](docs/CLI.md) | Commands and flags |
| [Rule authoring](docs/RULE_AUTHORING.md) | Writing checks and fixes |
| [Publishing](docs/PUBLISHING.md) | First npm publish |
| [Contributing](docs/CONTRIBUTING.md) | Development setup |

Internal specs: [docs/internal/](docs/internal/)

## Examples

- [`examples/minimal/`](examples/minimal/) — smallest working project
- [`examples/symphony-rules/`](examples/symphony-rules/) — advanced rules (reference only)

## Why not ESLint?

ESLint excels at syntax and universal style. checkr excels at **your** contract — token names, component hierarchies, folder import rules — in ~20 lines of plain JS per rule, without AST plugin boilerplate.

## License

MIT — see [LICENSE](LICENSE).
