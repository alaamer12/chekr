---
name: react-native-best-practices
description: Provides React Native performance optimization guidelines for FPS, TTI, bundle size, memory leaks, re-renders, and animations. Applies to tasks involving Hermes optimization, JS thread blocking, bridge overhead, FlashList, native modules, or debugging jank and frame drops.
license: MIT
author: Callstack
keywords: ["react-native", "expo", "performance", "optimization", "profiling"]
---

# Onboarding

Full skill: [`SKILL.md`](SKILL.md)

## Step 1: Validate React Native Setup

Before applying performance optimizations, ensure:
- **Expo CLI** or **React Native CLI** is installed
  - Verify with: `bunx expo --version` and `bunx react-native --version`
- Metro bundler is running (**apply only for** bundle analysis)
- React Native DevTools profiling is available through `agent-device react-devtools` (**apply only for** React render profiling/debugging)
  - Run `agent-device react-devtools status`, then `agent-device react-devtools wait --connected`

## Security Guardrails

- Review shell commands before running them and prefer version-pinned tooling from trusted sources.
- Do not pipe remote install scripts directly into a shell.
- Treat third-party packages as normal supply-chain dependencies that require provenance and version review.
- If using Re.Pack code splitting, only load first-party chunks from trusted HTTPS origins tied to the current release.

---

# When to Load Reference Files

Load files from `references/` **only if they exist**. Current inventory:

## JavaScript/React (`js-*`)

| Task | Reference |
|------|-----------|
| Reducing re-renders with state management | [`references/js-atomic-state.md`](references/js-atomic-state.md) |
| Using Concurrent React features | [`references/js-concurrent-react.md`](references/js-concurrent-react.md) |
| Optimizing animations | [`references/js-animations-reanimated.md`](references/js-animations-reanimated.md) |
| Fixing TextInput lag | [`references/js-uncontrolled-components.md`](references/js-uncontrolled-components.md) |

## Bundle & App Size (`bundle-*`)

| Task | Reference |
|------|-----------|
| Analyzing app size | [`references/bundle-analyze-app.md`](references/bundle-analyze-app.md) |
| Enabling tree shaking | [`references/bundle-tree-shaking.md`](references/bundle-tree-shaking.md) |
| Android code shrinking | [`references/bundle-r8-android.md`](references/bundle-r8-android.md) |
| Code splitting | [`references/bundle-code-splitting.md`](references/bundle-code-splitting.md) |

## Topics without reference files

For these, use inline guidance in [`SKILL.md`](SKILL.md) Quick Reference:

- FPS measurement, React profiling, list virtualization (FlatList/FlashList)
- TTI measurement and startup optimization
- Native profiling (Xcode Instruments, Android CPU Profiler)
- Turbo Modules, threading, native memory
- Barrel imports, Hermes mmap, library size evaluation

---

## Problem → Reference Mapping

| Problem | Start With |
|---------|------------|
| Too many re-renders | [`references/js-atomic-state.md`](references/js-atomic-state.md) |
| Expensive render blocking UI | [`references/js-concurrent-react.md`](references/js-concurrent-react.md) |
| Animation drops frames | [`references/js-animations-reanimated.md`](references/js-animations-reanimated.md) |
| TextInput lag | [`references/js-uncontrolled-components.md`](references/js-uncontrolled-components.md) |
| Large app size | [`references/bundle-analyze-app.md`](references/bundle-analyze-app.md) → [`references/bundle-r8-android.md`](references/bundle-r8-android.md) |
| Bundle bloat | [`references/bundle-tree-shaking.md`](references/bundle-tree-shaking.md) |
| App feels slow/janky | [`SKILL.md`](SKILL.md) → FPS & Re-renders section |
| Slow startup (TTI) | [`SKILL.md`](SKILL.md) → TTI Optimization section |
| List scroll jank | FlatList/FlashList + profile (no ref file) |
| Native module slow | [`SKILL.md`](SKILL.md) → Native Performance section |

---

## Quick Reference Commands

### FPS & Re-renders
```bash
agent-device react-devtools status
agent-device react-devtools wait --connected
agent-device react-devtools profile start
agent-device react-devtools profile stop
agent-device react-devtools profile slow --limit 5
agent-device react-devtools profile rerenders --limit 5
agent-device react-devtools profile timeline --limit 20
```

Drive the target interaction with normal `agent-device` commands between `profile start` and `profile stop`.

Manual fallback when `agent-device` is unavailable: open React Native DevTools from Metro (`j`) or the Dev Menu, use the Profiler tab, and record the same interaction.

For release-build React component profiling, connect [`@callstack/inspector`](https://github.com/callstackincubator/inspector#inspector) first so React DevTools can attach to the release app, then run the `agent-device react-devtools` flow above.

Baseline runtime metrics should come from the target interaction itself:
- Capture commit timeline, re-render counts, slow components, and heaviest-commit breakdown.
- Treat component tree depth and count as supporting context only.

**Common fixes:**
- Replace ScrollView with FlatList/FlashList for lists
- After profiling shows cascading re-renders, use React Compiler for automatic memoization
- After profiling shows broad store/context updates, use atomic state (Jotai/Zustand) — [`references/js-atomic-state.md`](references/js-atomic-state.md)
- Use `useDeferredValue` — [`references/js-concurrent-react.md`](references/js-concurrent-react.md)

**Review guardrails:**
- Check library versions before suggesting API-specific fixes. FlashList v2 deprecates `estimatedItemSize`.
- Do not suggest `useMemo` or `useCallback` dependency changes without a reproducible correctness issue or profiling evidence.
- Do not report stale closures unless the stale read path or repro is clear.

### Analyze Bundle Size
```bash
bunx react-native bundle \
  --entry-file index.js \
  --bundle-output output.js \
  --platform ios \
  --sourcemap-output output.js.map \
  --dev false --minify true

bunx source-map-explorer output.js --no-border-checks
```

**Common fixes:**
- Avoid barrel imports (import directly from source)
- Remove unnecessary Intl polyfills only after checking Hermes API and method coverage
- Tree shaking — [`references/bundle-tree-shaking.md`](references/bundle-tree-shaking.md)
- Enable R8 — [`references/bundle-r8-android.md`](references/bundle-r8-android.md)

### Measure TTI
- Use `react-native-performance` for markers
- Only measure cold starts (exclude warm/hot/prewarm)

**Common fixes:**
- For React Native 0.78 and earlier, disable Android JS bundle compression to enable Hermes mmap
- Use native navigation (react-native-screens)
- Preload commonly-used expensive screens before navigating to them

### Native Performance

**Profile native:**
- iOS: Xcode Instruments → Time Profiler
- Android: Android Studio → CPU Profiler

**Common fixes:**
- Use background threads for heavy native work
- Prefer async over sync Turbo Module methods
- Use C++ for cross-platform performance-critical code

## Priority Guidelines

Apply optimizations in this order:

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | FPS & Re-renders | CRITICAL | `js-*` |
| 2 | Bundle Size | CRITICAL | `bundle-*` |
| 3 | TTI Optimization | HIGH | `native-*`, `bundle-*` |
| 4 | Native Performance | HIGH | `native-*` |
| 5 | Memory Management | MEDIUM-HIGH | `js-*`, `native-*` |
| 6 | Animations | MEDIUM | `js-*` |

## Attribution

Based on "The Ultimate Guide to React Native Optimization" by Callstack.
