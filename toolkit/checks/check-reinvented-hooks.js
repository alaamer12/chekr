/**
 * Step 25: check-reinvented-hooks
 *
 * Detects manual reimplementations of hooks that Symphony already provides.
 * Uses two-phase scanning with lightweight scope analysis (brace-depth
 * tracking of useEffect blocks) for behavioral multi-line pattern detection.
 *
 * Patterns detected:
 *
 *   A  — Behavioral usePrevious: useRef(x) + ref.current=x INSIDE useEffect
 *   A2 — Naming usePrevious: useRef named prev*, previous*, prior*
 *   B  — Behavioral useStableCallback: useRef(fn) + ref.current=fn OUTSIDE useEffect
 *   C  — Manual useUpdateEffect: useRef(true/false) named isFirst*, isMounted*
 *   D  — Manual debounce: setTimeout + clearTimeout in same useEffect
 *   E  — Manual useToggle: useState(bool) + setter that negates
 *   F  — Raw timers in .tsx components
 */

import { buildIgnoredLines } from "../utils/ignore-handler.js";
import { runCheckCli } from "../utils/cli-runner.js";

// ═══════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE: Lightweight scope analysis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a list of useEffect/useLayoutEffect block ranges via brace-depth.
 * @param {string[]} lines
 * @returns {{ start: number, end: number }[]} 1-indexed inclusive ranges
 */
function buildEffectBlocks(lines) {
	const blocks = [];
	const effectRe = /\buse(?:Effect|LayoutEffect)\s*\(/;

	for (let i = 0; i < lines.length; i++) {
		if (!effectRe.test(lines[i])) continue;

		let depth = 0;
		let started = false;

		for (let j = i; j < lines.length; j++) {
			for (const ch of lines[j]) {
				if (ch === "{") {
					depth++;
					started = true;
				}
				if (ch === "}") depth--;
			}
			if (started && depth <= 0) {
				blocks.push({ start: i + 1, end: j + 1 });
				break;
			}
		}
	}

	return blocks;
}

function isInsideEffect(lineNum, blocks) {
	return blocks.some(b => lineNum >= b.start && lineNum <= b.end);
}

// ═══════════════════════════════════════════════════════════════════════════
// REGEX PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

// A2: naming heuristic
const PREV_REF_NAMING = /const\s+(prev\w*|previous\w*|prior\w*)\s*=\s*useRef\s*[<(]/;
const DOM_REF_HINTS = /Element|Node|Container|Wrapper|Div|Input|Button|Canvas|Svg|Reference$/i;

// A & B: useRef declaration — greedy .* skips complex generics, captures last (arg)
const REF_DECL = /const\s+(\w+)\s*=\s*useRef\b.*\(\s*(\w+)\s*\)\s*;?\s*$/;

// A & B: bare .current = identifier (allowed to have trailing comments)
const REF_REASSIGN = /^\s*(\w+)\.current\s*=\s*(\w+)\s*;?\s*(?:\/\/.*|\/\*.*\*\/)?\s*$/;

// C: first-mount guard refs
const FIRST_MOUNT_REF =
	/const\s+(isFirst\w*|isMounted\w*|initialRender\w*|firstRender\w*|firstMount\w*|skipFirst\w*|mountedRef\w*)\s*=\s*useRef\s*[<(]\s*(?:true|false)\s*\)/;

// D: debounce signals (checked per-block)
const HAS_SET_TIMEOUT = /\bsetTimeout\s*\(/;
const HAS_CLEAR_TIMEOUT = /\bclearTimeout\s*\(/;

// E: boolean state + negation toggle
const BOOL_STATE = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState\s*(?:<\w*>)?\(\s*(?:false|true)\s*\)/;

// F: raw timers
const RAW_TIMER = /\b(setTimeout|setInterval)\s*\(/;

const NON_CALLBACK_INIT = new Set(["null", "undefined", "0", "false", "true", "NaN"]);

export function checkReinventedHooks(source, filePath) {
	// ── Exclusions ──────────────────────────────────────────────────────
	if (filePath.includes("packages/shared/hooks/primitives")) return [];
	if (filePath.includes("packages/shared/hooks/composites")) return [];
	if (filePath.includes("packages/shared/blockiya-core/hooks")) return [];
	if (filePath.includes("blockiya-core.example.tsx")) return [];
	if (filePath.includes("packages/shared/blockiya-core/derivation")) return [];
	if (filePath.includes("__tests__") || filePath.includes(".test.") || filePath.includes(".spec.")) return [];
	if (filePath.includes(".stories.")) return [];
	if (filePath.endsWith(".md")) return [];
	if (filePath.includes("packages/toolkit/")) return [];
	if (filePath.includes("packages/adapters/")) return [];

	const violations = [];
	const lines = source.split("\n");
	const ignored = buildIgnoredLines(lines);
	const effectBlocks = buildEffectBlocks(lines);
	const reported = new Set();

	// ── Collect useRef declarations ─────────────────────────────────────
	const refDecls = new Map();
	lines.forEach((line, i) => {
		const ln = i + 1;
		if (ignored.has(ln)) return;
		const m = line.match(REF_DECL);
		if (m && !NON_CALLBACK_INIT.has(m[2])) {
			refDecls.set(m[1], { line: ln, initValue: m[2] });
		}
	});

	// ── Collect .current = value reassignments ──────────────────────────
	const reassignments = [];
	lines.forEach((line, i) => {
		const ln = i + 1;
		if (ignored.has(ln)) return;
		const m = line.match(REF_REASSIGN);
		if (m) {
			reassignments.push({
				ln,
				refName: m[1],
				value: m[2],
				inEffect: isInsideEffect(ln, effectBlocks),
			});
		}
	});

	// ═════════════════════════════════════════════════════════════════════
	// A: Behavioral usePrevious
	//    useRef(x) + ref.current = x INSIDE useEffect
	// ═════════════════════════════════════════════════════════════════════
	for (const r of reassignments) {
		if (!r.inEffect) continue;
		const decl = refDecls.get(r.refName);
		if (decl && decl.initValue === r.value) {
			reported.add(r.ln);
			reported.add(decl.line);
			violations.push({
				file: filePath,
				line: decl.line,
				text: lines[decl.line - 1].trim(),
				message:
					"Manual usePrevious — useRef initialized with value and updated inside useEffect. Use useStableValue from @symphony/shared/hooks/composites",
				fix: `const prev = useStableValue(${r.value})`,
			});
		}
	}

	// ═════════════════════════════════════════════════════════════════════
	// A2: Naming heuristic (catches refs behavioral can't reach)
	// ═════════════════════════════════════════════════════════════════════
	lines.forEach((line, i) => {
		const ln = i + 1;
		if (ignored.has(ln) || reported.has(ln)) return;
		const m = line.match(PREV_REF_NAMING);
		if (m && !DOM_REF_HINTS.test(m[1])) {
			reported.add(ln);
			violations.push({
				file: filePath,
				line: ln,
				text: line.trim(),
				message:
					"Ref named prev*/previous*/prior* suggests manual previous-value tracking — use useStableValue from @symphony/shared/hooks/composites",
				fix: `const ${m[1].replace(/Ref$/, "")} = useStableValue(value)`,
			});
		}
	});

	// ═════════════════════════════════════════════════════════════════════
	// B: Behavioral useStableCallback
	//    useRef(fn) + ref.current = fn OUTSIDE useEffect
	// ═════════════════════════════════════════════════════════════════════
	for (const r of reassignments) {
		if (r.inEffect) continue;
		if (reported.has(r.ln)) continue;
		const decl = refDecls.get(r.refName);
		if (decl && decl.initValue === r.value) {
			reported.add(r.ln);
			violations.push({
				file: filePath,
				line: r.ln,
				text: lines[r.ln - 1].trim(),
				message:
					"Manual useStableCallback — useRef + .current reassignment every render. Use useStableCallback from blockiya-core",
				fix: `const stableFn = useStableCallback(${r.value})`,
			});
		}
	}

	// ═════════════════════════════════════════════════════════════════════
	// C: Manual lifecycle guards (isFirstMount, isMounted, etc.)
	// ═════════════════════════════════════════════════════════════════════
	lines.forEach((line, i) => {
		const ln = i + 1;
		if (ignored.has(ln) || reported.has(ln)) return;
		const m = line.match(FIRST_MOUNT_REF);
		if (m) {
			reported.add(ln);
			const varName = m[1];
			const isFirst = /first|initial|skip/i.test(varName);
			const message = isFirst
				? "Manual first-mount guard via useRef — use useFirstMountState or useUpdateEffect from @symphony/shared/hooks"
				: "Manual mount-status tracking via useRef — use useIsMounted from @symphony/shared/hooks";
			const fix = isFirst ? "const isFirst = useFirstMountState()" : "const isMounted = useIsMounted()";

			violations.push({
				file: filePath,
				line: ln,
				text: line.trim(),
				message,
				fix,
			});
		}
	});

	// ═════════════════════════════════════════════════════════════════════
	// D: Manual debounce (setTimeout + clearTimeout in same useEffect)
	// ═════════════════════════════════════════════════════════════════════
	for (const block of effectBlocks) {
		let hasTimeout = false;
		let hasClear = false;
		let timeoutLn = -1;

		for (let ln = block.start; ln <= block.end; ln++) {
			if (ignored.has(ln)) continue;
			const line = lines[ln - 1];
			if (HAS_SET_TIMEOUT.test(line)) {
				hasTimeout = true;
				timeoutLn = ln;
			}
			if (HAS_CLEAR_TIMEOUT.test(line)) hasClear = true;
		}

		if (hasTimeout && hasClear && !reported.has(timeoutLn)) {
			reported.add(timeoutLn);
			violations.push({
				file: filePath,
				line: block.start,
				text: lines[block.start - 1].trim(),
				message:
					"Manual debounce — setTimeout + clearTimeout inside useEffect. Use useDebounceInput or useDebouncedCallback from composites",
				fix: "const { value } = useDebounceInput(rawValue, { delay: 300 })",
			});
		}
	}

	// ═════════════════════════════════════════════════════════════════════
	// E: Manual useToggle — useState(bool) + negation setter
	// ═════════════════════════════════════════════════════════════════════
	const boolStates = new Map();
	lines.forEach((line, i) => {
		const ln = i + 1;
		if (ignored.has(ln)) return;
		const m = line.match(BOOL_STATE);
		if (m) boolStates.set(m[2], { line: ln, stateName: m[1] });
	});

	if (boolStates.size > 0) {
		lines.forEach((line, i) => {
			const ln = i + 1;
			if (ignored.has(ln) || reported.has(ln)) return;

			for (const [setter, info] of boolStates) {
				// Match: setX(!x), setX(prev => !prev), setX(p => !p)
				const negRe = new RegExp(
					`\\b${setter}\\s*\\(\\s*(?:` +
						// Form 1: setX(!stateName)
						`!\\s*${info.stateName}` +
						`|` +
						// Form 2: setX(p => !p) or setX((p) => !p)
						`\\(?\\s*\\w+\\s*\\)?\\s*=>\\s*!\\s*\\w+` +
						`)`
				);
				if (negRe.test(line)) {
					reported.add(ln);
					reported.add(info.line);
					violations.push({
						file: filePath,
						line: info.line,
						text: lines[info.line - 1].trim(),
						message:
							"Manual useToggle — useState(bool) + negation. Use useToggleState from @symphony/shared/hooks/composites",
						fix: `const { value: ${info.stateName}, toggle } = useToggleState()`,
					});
					break;
				}
			}
		});
	}

	// ═════════════════════════════════════════════════════════════════════
	// F: Raw timers in .tsx component files
	//    Skips blockiyas (handled by check-blockiya-patterns step 10)
	// ═════════════════════════════════════════════════════════════════════
	if (filePath.endsWith(".tsx") && !filePath.includes("/blockiyas/")) {
		lines.forEach((line, i) => {
			const ln = i + 1;
			if (ignored.has(ln) || reported.has(ln)) return;

			const m = line.match(RAW_TIMER);
			if (m) {
				const fn = m[1];
				const hook =
					fn === "setTimeout"
						? "useTimeoutEffect or useDebouncedCallback"
						: "useIntervalEffect or useThrottledCallback";
				violations.push({
					file: filePath,
					line: ln,
					text: line.trim(),
					message: `Raw ${fn}() in component — use ${hook} from @symphony/shared/hooks`,
					fix:
						fn === "setTimeout"
							? "import { useTimeoutEffect } from '@symphony/shared/hooks/primitives'"
							: "import { useIntervalEffect } from '@symphony/shared/hooks/primitives'",
				});
			}
		});
	}

	return violations;
}

// CLI entry point
runCheckCli(import.meta.url, checkReinventedHooks, {
	step: 25,
	name: "check-reinvented-hooks",
	extensions: [".ts", ".tsx"],
});
