---
name: bug-hunting-skill
description: React 19.x bug-hunting reference — recurring failure modes from hooks misuse to state architecture, with bad/good examples and detection signals. Used by the bug-hunter subagent before scanning each package. Read reference.md in full every time.
---

# Bug Hunting Skill

Practical reference for finding real bugs in React/TypeScript code. Written against the **React 19.x** API surface.

## Mandatory usage (bug-hunter subagent)

**Before scanning each package**, read the full reference file from top to bottom:

→ [`.cursor/skills/bug-hunting-skill/reference.md`](reference.md)

Do this **again for every package** — do not rely on memory from the previous package. Re-read to refresh detection signals and mental models before hunting.

When reporting a bug, cite which **pattern number + name** from the reference applies (e.g. `§5 Race conditions`, `§2 Missing deps`).

## Scope by package type

| Package kind | Apply |
|--------------|-------|
| React/TSX (`packages/ui`, `packages/features/*`, `packages/i18n`, hooks in `packages/cache`) | All 15 patterns in reference.md |
| Server/Node (`packages/api`, `packages/db`, `packages/jobs`, `packages/shared`) | §4–6, §8 (async, mutation, impure reducers), plus general logic/auth/SQL checks |
| Next.js utilities (`packages/next`) | React patterns + server/client boundary issues |

## How to use while hunting

1. Re-read `reference.md` completely.
2. Scan source with **detection signals** from each section in mind.
3. Only report findings ≥85% confidence with file, line, pattern reference, and why it is a bug today.

Full pattern catalog: **[reference.md](reference.md)**
