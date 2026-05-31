# checkr — Rule Authoring Guide

Writing checks and fixes for checkr.

---

## Anatomy of a check file

```
.checkr/checks/
  check_raw_colors.js      ← filename: check_ prefix + snake_case
  check_raw_sizes.js
  check_box_as_primitive.js
```

### Minimal check

```js
// .checkr/checks/check_raw_colors.js

export function checkRawColors(source, filePath) {
  const violations = []
  const lines = source.split('\n')

  lines.forEach((line, i) => {
    if (/#[0-9a-fA-F]{6}/.test(line)) {
      violations.push({
        file: filePath,
        line: i + 1,
        text: line.trim(),
        message: 'Raw hex color — use a design token instead',
        fix: "import { color } from '@your-project/tokens'",
      })
    }
  })

  return violations
}
```

That's it. A function, a loop, an array. No framework, no AST, no plugin registration.

---

## Using ignore blocks

checkr respects inline ignore blocks. Use `buildIgnoredLines` from `@checkr/utils` to skip them:

```js
import { buildIgnoredLines } from '@checkr/utils'

export function checkRawColors(source, filePath) {
  const lines = source.split('\n')
  const ignored = buildIgnoredLines(lines)  // Set<lineNumber>
  const violations = []

  lines.forEach((line, i) => {
    const lineNum = i + 1
    if (ignored.has(lineNum)) return  // skip ignored lines

    if (/#[0-9a-fA-F]{6}/.test(line)) {
      violations.push({
        file: filePath,
        line: lineNum,
        text: line.trim(),
        message: 'Raw hex color — use a design token instead',
      })
    }
  })

  return violations
}
```

Ignore blocks in source files:

```js
// ---------- @checkr-ignore-start
const color = '#5B8FF9'  // intentional — this line is skipped
// ---------- @checkr-ignore-end
```

The dashes are optional decoration. Only the marker keyword matters:

```js
// @checkr-ignore-start
const color = '#5B8FF9'
// @checkr-ignore-end
```

---

## Skipping files

Return an empty array early for files you don't want to check:

```js
export function checkRawColors(source, filePath) {
  const norm = filePath.replace(/\\/g, '/')

  // Skip token definition files — raw values live here intentionally
  if (norm.includes('tokens/')) return []

  // Skip test files
  if (norm.includes('.test.') || norm.includes('.spec.')) return []

  // ... rest of check
}
```

---

## One check function per file

Each check file exports exactly one function starting with `check`. The engine uses this as the single entry point for the rule.

```js
// ✅ correct — one check function
export function checkRawColors(source, filePath) {
  // ...
}

// ❌ wrong — two check functions in one file
export function checkRawColors(source, filePath) { ... }
export function checkRawSizes(source, filePath) { ... }
// Engine will reject this file at startup
```

If you have related checks, put them in separate files:

```
.checkr/checks/
  check_raw_colors.js    ← exports checkRawColors
  check_raw_sizes.js     ← exports checkRawSizes
```

Helper functions are fine — they just can't start with `check`:

```js
// ✅ correct — one check function, private helpers
function isIgnoredPath(filePath) { ... }      // helper — not a check
function buildPattern(raw) { ... }            // helper — not a check

export function checkRawColors(source, filePath) {
  if (isIgnoredPath(filePath)) return []
  // uses buildPattern internally
}
```

---

## Anatomy of a fix file

```
.checkr/fixes/
  fix_raw_sizes.js      ← filename: fix_ prefix + snake_case
  fix_raw_colors.js
```

### Minimal fix

```js
// .checkr/fixes/fix_raw_sizes.js

export function fixRawSizes(source, filePath, violations) {
  let result = source

  for (const v of violations) {
    // Apply substitution based on violation data
    result = result.replace(/"16px"/g, '{space.md}')
  }

  return result  // always return a string
}
```

### Fix with inner args (passed via --)

```js
// .checkr/fixes/fix_raw_sizes.js

export function fixRawSizes(source, filePath, violations, args = []) {
  const dryRun = args.includes('--dry-run')
  const onlyJsx = args.includes('--only-jsx')

  if (dryRun) {
    console.log(`Would fix ${violations.length} violations in ${filePath}`)
    return source  // return unchanged
  }

  // ... apply fixes
  return modifiedSource
}
```

Called as:
```
checkr fix -- --dry-run --only-jsx
```

---

## Violation object reference

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | File path (relative or absolute) |
| `line` | `number` | 1-indexed line number |
| `text` | `string` | The offending line (trimmed) |
| `message` | `string` | Human-readable description |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `fix` | `string` | Suggested fix hint shown in output |
| `rule` | `string` | Rule id (auto-populated if omitted) |
| `severity` | `'error' \| 'warn'` | Default: `'error'` |

---

## Using utilities

```js
import {
  walkFiles,         // walk a directory for files
  buildIgnoredLines, // parse ignore blocks
  readFileLines,     // split source into lines
} from '@checkr/utils'
```

### `walkFiles(rootDir, extensions, excludePatterns?)`

```js
const files = walkFiles('.', ['.ts', '.tsx'], ['node_modules', 'dist'])
// → ['src/Button.tsx', 'src/utils.ts', ...]
```

### `buildIgnoredLines(lines, marker?)`

```js
const lines = source.split('\n')
const ignored = buildIgnoredLines(lines)
// → Set { 5, 6, 7 }  (lines inside ignore blocks)

// Custom marker
const ignored = buildIgnoredLines(lines, '@symphony-ignore')
```

### `readFileLines(source)`

```js
const lines = readFileLines(source)
// → string[]  (same as source.split('\n'))
```

---

## Patterns and best practices

### Normalize file paths

Windows uses backslashes. Always normalize before string matching:

```js
const norm = filePath.replace(/\\/g, '/')
if (norm.includes('packages/tokens/')) return []
```

### Skip comment lines

Don't flag violations inside comments:

```js
const trimmed = line.trim()
if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
```

### One violation per line

If a line has multiple violations of the same rule, report it once:

```js
const reportedLines = new Set()

lines.forEach((line, i) => {
  const lineNum = i + 1
  if (reportedLines.has(lineNum)) return

  if (pattern.test(line)) {
    reportedLines.add(lineNum)
    violations.push({ ... })
  }
})
```

### Never throw

Wrap risky operations:

```js
export function checkComplexRule(source, filePath) {
  try {
    // ... complex logic
    return violations
  } catch {
    return []  // silent skip — don't crash the pipeline
  }
}
```

### Keep checks fast

- Avoid regex with catastrophic backtracking
- Prefer `string.includes()` for simple substring checks before applying regex
- Do the cheap checks first, expensive checks last

```js
// ✅ fast path first
if (!line.includes('rgba')) return

// then apply regex
if (/rgba\s*\(\s*\d/.test(line)) {
  violations.push(...)
}
```

---

## Example: complete check file

```js
// .checkr/checks/check_raw_colors.js
//
// Detects raw hex/rgba/hsl color strings in component files.
// These should use design tokens instead.

import { buildIgnoredLines } from '@checkr/utils'

const VIOLATIONS = [
  {
    pattern: /["'`]#[0-9a-fA-F]{3,8}\b/,
    message: 'Raw hex color — use a color token instead',
    fix: "import { color } from '@your-project/tokens'",
  },
  {
    pattern: /rgba?\s*\(\s*\d/,
    message: 'Raw rgba/rgb color — use a token with .alpha() instead',
    fix: 'color.primary.alpha(0.12)',
  },
]

const SKIP_PATHS = ['tokens/', 'node_modules/', '.test.', '.spec.']

export function checkRawColors(source, filePath) {
  const norm = filePath.replace(/\\/g, '/')
  if (SKIP_PATHS.some(p => norm.includes(p))) return []

  const lines = source.split('\n')
  const ignored = buildIgnoredLines(lines)
  const violations = []

  for (const { pattern, message, fix } of VIOLATIONS) {
    lines.forEach((line, i) => {
      const lineNum = i + 1
      if (ignored.has(lineNum)) return

      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: lineNum,
          text: trimmed,
          message,
          fix,
        })
      }
    })
  }

  return violations
}
```
