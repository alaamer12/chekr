# checkr

> AI output alignment checker. A pipeline step that ensures AI-generated code stays within your design system contract.

```
npm install -g @checkr/cli
checkr run
```

---

## What is checkr?

checkr is **not** a linter. It does not replace ESLint, Prettier, or TypeScript.

checkr is a **pipeline step** that sits between AI code generation and your commit. It runs a set of project-defined rules against source files and reports violations — patterns that indicate the AI drifted from your design system, token system, or architectural contract.

```
AI generates code
  → ESLint        catches syntax/style issues
  → checkr        catches design contract violations   ← this tool
  → Tests         catch behavioral regressions
  → Commit
```

### The problem it solves

AI models generate confident, syntactically correct code that violates your project's conventions. They use `"16px"` instead of `space.md`. They write `<Box as="button">` instead of `<Button>`. They reach for `rgba(255,255,255,0.2)` instead of `palette.white[20]`.

ESLint can't catch these — they require knowledge of your specific token system, component hierarchy, and architectural rules. Writing them as ESLint rules requires 200 lines of AST visitor boilerplate per rule. Writing them as checkr rules takes 20 lines of plain JavaScript.

checkr makes your design system contract **executable and enforceable** across every AI session, every developer, every model.

---

## Quick start

```bash
# Install
npm install -g @checkr/cli

# Initialize a project
checkr init

# Run all checks
checkr run

# Run only on changed files (since last commit)
checkr run --changed

# Run and auto-fix
checkr run --fix

# Watch mode
checkr watch
```

checkr looks for rules in `.checkr/checks/` by default:

```
your-project/
  .checkr/
    checks/
      check_raw_colors.js
      check_raw_sizes.js
    fixes/
      fix_raw_sizes.js
    checkr.config.js     ← optional
```

---

## Documentation

- [Requirements](./REQUIREMENTS.md) — full feature specification
- [Architecture](./ARCHITECTURE.md) — engine design and internals
- [Rule Authoring Guide](./RULE_AUTHORING.md) — how to write checks and fixes
- [Configuration Reference](./CONFIG.md) — all config options
- [CLI Reference](./CLI.md) — all commands and flags
- [Roadmap](./ROADMAP.md) — planned features and milestones

---

## Packages

| Package | Description |
|---------|-------------|
| `@checkr/core` | Engine: file scanning, rule loading, violation reporting |
| `@checkr/cli` | CLI wrapper around core |
| `@checkr/utils` | Shared utilities for rule authors |

---

## License

MIT
