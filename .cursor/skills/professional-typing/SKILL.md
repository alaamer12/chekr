---
name: professional-typing
description: >-
  Converts plain string/boolean config and API types into a professional typing
  system with semantic aliases, JSDoc, runtime validation, and tests. Use when
  the user asks for better types, PathLike, checkr.config.d.ts, Zod schema,
  validateConfig, or professional typing for configs and public APIs.
---

# professional-typing

Turn **basic `string` / `boolean` fields** into a **documented, validated type system** that helps editors, authors, and CI — without hurting JS consumers.

---

## When to use

- Config files (`*.config.js`, env shapes, CLI patches)
- Public package APIs and rule contracts
- User says: "professional types", "PathLike", "semantic types", "add Zod", "improve .d.ts"

**Not for:** internal implementation details with no public surface — keep those as JSDoc in `.js`.

---

## Principles

| Rule | Why |
|------|-----|
| **Semantic aliases over branded types** | `PathLike = string` documents intent; users don't cast in `.js` configs |
| **Template literals where format matters** | `CheckId = \`check_${string}\`` |
| **Unions over loose strings** | `ScanMode = "full" \| "changed" \| "staged"` |
| **Three layers** | `.d.ts` (authoring) → runtime validator (engine) → Zod schema (dev/CI) |
| **Runtime stays zero-dep in core** | Plain JS `validateConfig()` in helpers; Zod only in `@…/types` if needed |
| **Keep .d.ts and validator in sync** | One change updates both |

---

## Workflow (checklist)

```
- [ ] 1. Inventory fields — list every property, current type, real-world constraints
- [ ] 2. Name primitives — PathLike, GlobPattern, PositiveInt, etc. (see reference.md)
- [ ] 3. Write declare module or package .d.ts with JSDoc + composed interfaces
- [ ] 4. Add CliConfigPatch / Resolved* types if config is layered
- [ ] 5. Mirror runtime validation in @checkr/helpers validateConfig (or equivalent)
- [ ] 6. Add schema.zod.js (or Zod .ts) + tests in types package
- [ ] 7. Add typecheck script: tsc -p types/tsconfig.json
- [ ] 8. Document usage: /** @type {import('…').Config} */
```

---

## Package layout (recommended)

```
types/
  checkr.config.d.ts    # declare module "…" — user-facing
  primitives.d.ts         # optional re-exports
  schema.zod.js           # Zod mirror (dev / publish as optional export)
  package.json            # @scope/types
  tsconfig.json
  __tests__/config.schema.test.js
```

---

## Primitive naming guide

| Instead of | Use | Validates |
|------------|-----|-----------|
| `string` path | `PathLike` | non-empty |
| `string` glob | `GlobPattern` | non-empty |
| `string \| null` ignore file | `GitignorePath` | string or null |
| `string` extension | `FileExtension` | starts with `.` |
| `string` rule id | `CheckId` | `^check_[a-z][a-z0-9_]*$` |
| `number` workers | `PositiveInt` | integer ≥ 1 |
| `string` reporter | `ReporterType` | enum union |

Full catalog: [reference.md](reference.md)

---

## Runtime validation (production)

Enhance existing JS validator — **no new runtime deps** in engine packages:

```js
const CHECK_ID_PATTERN = /^check_[a-z][a-z0-9_]*$/;

function assertCheckId(value, path) {
  if (typeof value !== "string" || !CHECK_ID_PATTERN.test(value)) {
    throw new ConfigError(`${path} must match check_<snake_case>`, path);
  }
}
```

Throw `ConfigError` with `path` field for every failure (field path like `steps[0].id`).

---

## Zod mirror (dev / types package)

```js
import { z } from "zod";

const checkId = z.string().regex(/^check_[a-z][a-z0-9_]*$/);
export const checkrConfigSchema = z.object({
  checksDir: z.string().min(1).optional(),
  scanMode: z.enum(["full", "changed", "staged"]).optional(),
  steps: z.array(z.object({ id: checkId })).optional(),
});
```

Test with `bun test` in types package. Prefer **Zod** over typia when Vitest/bun test must run without compile transforms.

---

## Typia (optional)

Use typia only when:
- Consumer is TypeScript-only
- Build pipeline already runs typia transform

Otherwise document typia as optional in README; ship Zod for CI.

---

## Before / after

See [examples.md](examples.md) for full before/after on checkr config.

---

## Definition of done

- [ ] No bare `string` on public config fields where semantics exist
- [ ] `declare module` or exported interfaces with JSDoc examples
- [ ] Runtime validator matches .d.ts constraints
- [ ] Zod schema + tests pass (`bun test` in types)
- [ ] `tsc -p types` passes
- [ ] README snippet for `/** @type {import('…')} */`

---

## Additional resources

- [reference.md](reference.md) — primitive catalog, layering diagram
- [examples.md](examples.md) — checkr.config before/after
- Live reference: `types/checkr.config.d.ts`, `types/schema.zod.js`
