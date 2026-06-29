---
name: react-native-best-practices
description: Provides React Native performance optimization guidelines for FPS, TTI, bundle size, memory leaks, re-renders, and animations. Applies to tasks involving Hermes optimization, JS thread blocking, bridge overhead, FlashList, native modules, or debugging jank and frame drops.
license: MIT
metadata:
  author: Callstack
  tags: react-native, expo, performance, optimization, profiling
---

# React Native Best Practices

## Overview

Performance optimization guide for React Native applications, covering JavaScript/React, Native (iOS/Android), and bundling optimizations. Based on Callstack's "Ultimate Guide to React Native Optimization".

For condensed onboarding, see [`POWER.md`](POWER.md).

## When to Apply

Reference these guidelines when:
- Debugging slow/janky UI or animations
- Investigating memory leaks (JS or native)
- Optimizing app startup time (TTI)
- Reducing bundle or app size
- Writing native modules (Turbo Modules)
- Profiling React Native performance
- Reviewing React Native code for performance

## Security Notes

- Treat shell commands in these references as local developer operations. Review them before running, prefer version-pinned tooling, and avoid piping remote scripts directly to a shell.
- Treat third-party libraries and plugins as dependencies that still require normal supply-chain controls: pin versions, verify provenance, and update through your standard review process.
- If using Re.Pack code splitting, only load first-party chunks from trusted HTTPS origins tied to the current release.

## Priority-Ordered Guidelines

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | FPS & Re-renders | CRITICAL | `js-*` |
| 2 | Bundle Size | CRITICAL | `bundle-*` |
| 3 | TTI Optimization | HIGH | `native-*`, `bundle-*` |
| 4 | Native Performance | HIGH | `native-*` |
| 5 | Memory Management | MEDIUM-HIGH | `js-*`, `native-*` |
| 6 | Animations | MEDIUM | `js-*` |

Impact labels are triage hints: CRITICAL first, HIGH next, MEDIUM when evidence points there.

## Quick Reference

### Optimization Workflow

Follow this cycle for any performance issue: **Measure → Optimize → Re-measure → Validate**

1. **Measure**: Capture baseline metrics before changes. For runtime issues, prefer commit timeline, re-render counts, slow components, heaviest-commit breakdown, and startup/TTI when available. Component tree depth or count are optional context, not substitutes. Do not recommend memoization, atomic state, or compiler changes without a measured render or FPS problem.
2. **Optimize**: Apply the targeted fix from the relevant reference (or inline guidance below)
3. **Re-measure**: Run the same measurement to get updated metrics
4. **Validate**: Confirm improvement (e.g., FPS 45→60, TTI 3.2s→1.8s, bundle 2.1MB→1.6MB)

If metrics did not improve, revert and try the next suggested fix.

### Review Guardrails

- Check library versions before suggesting API-specific fixes. Example: FlashList v2 deprecates `estimatedItemSize`, so do not flag it as missing there.
- Do not suggest `useMemo` or `useCallback` dependency changes unless behavior is demonstrably incorrect or profiling shows wasted work tied to that value.
- Do not report stale closures speculatively. Show the stale read path, a repro, or profiler evidence before calling it out.
- When profiling a flow, measure the target interaction itself. Do not treat component tree depth or component count as the main performance evidence.

### Critical: FPS & Re-renders

**Profile first:**
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

**Common fixes:**
- Replace ScrollView with FlatList/FlashList/Legend List for long lists
- After profiling shows cascading re-renders, use React Compiler for automatic memoization
- After profiling shows broad store/context updates, use atomic state (Jotai/Zustand) to reduce re-renders — see [`references/js-atomic-state.md`](references/js-atomic-state.md)
- Use `useDeferredValue` / `useTransition` — see [`references/js-concurrent-react.md`](references/js-concurrent-react.md)

### Critical: Bundle Size

**Analyze bundle:**
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
- Tree shaking — see [`references/bundle-tree-shaking.md`](references/bundle-tree-shaking.md)
- Re.Pack code splitting — see [`references/bundle-code-splitting.md`](references/bundle-code-splitting.md)
- Enable R8 for Android — see [`references/bundle-r8-android.md`](references/bundle-r8-android.md)

### High: TTI Optimization

**Measure TTI:**
- Use `react-native-performance` for markers
- Only measure cold starts (exclude warm/hot/prewarm)

**Common fixes:**
- For React Native 0.78 and earlier, disable Android JS bundle compression to enable Hermes mmap
- Use native navigation (react-native-screens)
- Preload commonly-used expensive screens before navigating to them

### High: Native Performance

**Profile native:**
- iOS: Xcode Instruments → Time Profiler
- Android: Android Studio → CPU Profiler

**Common fixes:**
- Use background threads for heavy native work
- Prefer async over sync Turbo Module methods
- Use C++ for cross-platform performance-critical code

---

## References (available files)

Only the following reference files exist under `references/`. **Do not link to removed files.**

### JavaScript/React (`js-*`)

| File | Impact | Description |
|------|--------|-------------|
| [`references/js-atomic-state.md`](references/js-atomic-state.md) | HIGH | Jotai/Zustand patterns to reduce re-renders |
| [`references/js-concurrent-react.md`](references/js-concurrent-react.md) | HIGH | `useDeferredValue`, `useTransition` |
| [`references/js-animations-reanimated.md`](references/js-animations-reanimated.md) | MEDIUM | Reanimated worklets |
| [`references/js-uncontrolled-components.md`](references/js-uncontrolled-components.md) | HIGH | TextInput optimization |

### Bundling (`bundle-*`)

| File | Impact | Description |
|------|--------|-------------|
| [`references/bundle-analyze-app.md`](references/bundle-analyze-app.md) | HIGH | App size analysis |
| [`references/bundle-tree-shaking.md`](references/bundle-tree-shaking.md) | HIGH | Dead code elimination |
| [`references/bundle-r8-android.md`](references/bundle-r8-android.md) | HIGH | Android code shrinking |
| [`references/bundle-code-splitting.md`](references/bundle-code-splitting.md) | MEDIUM | Re.Pack code splitting |

Supporting images live in `references/images/`.

Topics **without** a dedicated reference file (lists, profiling, TTI measurement, native modules, memory leaks, barrel exports, Hermes mmap, etc.) — use the **Quick Reference** sections above and [`POWER.md`](POWER.md).

---

## Problem → Reference Mapping

| Problem | Start With |
|---------|------------|
| Too many re-renders / broad state updates | [`references/js-atomic-state.md`](references/js-atomic-state.md) |
| Expensive render blocking input | [`references/js-concurrent-react.md`](references/js-concurrent-react.md) |
| Animation drops frames | [`references/js-animations-reanimated.md`](references/js-animations-reanimated.md) |
| TextInput lag | [`references/js-uncontrolled-components.md`](references/js-uncontrolled-components.md) |
| Large app size | [`references/bundle-analyze-app.md`](references/bundle-analyze-app.md) → [`references/bundle-r8-android.md`](references/bundle-r8-android.md) |
| Bundle bloat / dead code | [`references/bundle-tree-shaking.md`](references/bundle-tree-shaking.md) |
| Code splitting | [`references/bundle-code-splitting.md`](references/bundle-code-splitting.md) |
| App feels slow/janky (no ref file) | Quick Reference → profile with React DevTools / `agent-device` |
| Slow startup / TTI (no ref file) | Quick Reference → TTI section + bundle analysis |
| List scroll jank (no ref file) | Use FlatList/FlashList; profile first |
| Native module slow (no ref file) | Quick Reference → Native Performance section |

---

## Related skills

| Skill | When |
|-------|------|
| [`building-native-ui`](../building-native-ui/SKILL.md) | Expo Router screens, navigation, native UI patterns |
| [`expo-ui`](../expo-ui/SKILL.md) | `@expo/ui` SwiftUI/Compose components |
| [`bug-hunting-skill`](../bug-hunting-skill/SKILL.md) | React hooks/state bugs in shared web+native code |

## Attribution

Based on "The Ultimate Guide to React Native Optimization" by Callstack.
