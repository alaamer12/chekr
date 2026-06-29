# Contributing to chekr

## Repository layout

```
chekr/
  packages/
    helpers/     @chekr/helpers — internal; bundled into CLI
    utils/       @chekr/utils   — internal; bundled into CLI
    core/        @chekr/core    — internal; bundled into CLI
    cli/         @chekr/cli     — published — `chekr` binary
  types/         @chekr/types   — published — TypeScript + Zod
  docs/          User + internal documentation
  examples/      minimal + symphony-rules samples
```

## Setup

```bash
git clone https://github.com/alaamer12/chekr.git
cd chekr
bun install
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run verify` | lint + typecheck + test:all + smoke |
| `bun run lint` | Biome check on `packages/**` |
| `bun run lint:fix` | Auto-fix lint issues |
| `bun run test:all` | All package tests |
| `bun run smoke` | E2E in `examples/minimal` |

## Rule contract (stable API)

Do not break without a major version bump:

- Check: `(source: string, filePath: string, context?) => Violation[]`
- Fix: `(source, filePath, violations, args?) => string`
- Filenames: `check_*.js`, `fix_*.js`
- Export names derived from filename (`check_raw_colors` → `checkRawColors`)

## Adding a feature

1. Read [internal/REQUIREMENTS.md](internal/REQUIREMENTS.md) and [internal/ARCHITECTURE.md](internal/ARCHITECTURE.md)
2. Implement with tests in the owning package
3. Update user docs in `docs/CONFIG.md` or `docs/CLI.md` if user-facing
4. Run `bun run verify`

## Publishing

See [PUBLISHING.md](PUBLISHING.md).

## Agent skills (optional)

This repo includes Cursor skills under `.cursor/skills/` (`up-agents`, `quality-gate`, `professional-typing`). Not required for CLI users.
