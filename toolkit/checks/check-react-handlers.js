/**
 * Step 45: check-react-handlers
 *
 * Flags event handlers that should be promoted to useEffect or a custom hook
 * (lifecycle contracts, orchestration, state machines, co-mutation clusters).
 */

import { buildIgnoredLines } from "../utils/ignore-handler.js";
import { runCheckCli } from "../utils/cli-runner.js";
import { extractBody } from "../utils/react-loc-counter.js";
import { analyzeHandler } from "./check-react-handlers/index.js";

// ---------------------------------------------------------------------------
// Scope / skip rules (aligned with check-react-srp)
// ---------------------------------------------------------------------------

const EXCLUDED_PATH_SEGMENTS = [
	"node_modules/",
	"packages/primitives/",
	"packages/toolkit/",
	"packages/shared/hooks/",
	"__tests__/",
];

const APPS_PATH_RE = /(^|\/)apps\//;

const HANDLER_NAME_RE = /^(?:handle|on)[A-Z]/;

/** const handleFoo = … or const onSubmit = … (optional useCallback wrapper) */
const CONST_HANDLER_RE =
	/^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:useCallback\s*\(\s*)?(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;

/** function handleFoo( … */
const FN_HANDLER_RE = /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;

const USE_CALLBACK_RE = /\buseCallback\s*\(/;

const MIN_BODY_LINES = 2;

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

function shouldSkipFile(filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	if (EXCLUDED_PATH_SEGMENTS.some(seg => normalised.includes(seg))) return true;
	if (APPS_PATH_RE.test(normalised)) return true;
	if (/\.(test|spec)\.[jt]sx?$/.test(normalised)) return true;
	if (/\.stories\.(tsx?|jsx?)$/.test(normalised)) return true;
	return false;
}

function isHandlerName(name) {
	return HANDLER_NAME_RE.test(name);
}

/**
 * Build useEffect block ranges (1-indexed inclusive) for suppression inside effects.
 * @param {string[]} lines
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

function isRangeIgnored(startLine, endLine, ignored) {
	for (let ln = startLine; ln <= endLine; ln++) {
		if (ignored.has(ln)) return true;
	}
	return false;
}

/**
 * For useCallback-wrapped handlers, start body extraction at the inner `=> {` line.
 * @param {string[]} lines
 * @param {number} declLineIdx 0-based index of the declaration line
 */
function callbackBodyStartIdx(lines, declLineIdx) {
	const windowEnd = Math.min(lines.length, declLineIdx + 12);
	for (let i = declLineIdx; i < windowEnd; i++) {
		const line = lines[i];
		if (/=>\s*\{/.test(line)) return i;
		if (/=>\s*$/.test(line.trim()) && i + 1 < lines.length && lines[i + 1].trim().startsWith("{")) {
			return i;
		}
		if (/\buseCallback\s*\(\s*(?:async\s+)?function\b/.test(line)) return i;
	}
	return declLineIdx;
}

/**
 * @param {string[]} lines
 * @param {number} declLineIdx 0-based
 * @returns {{ name: string, bodyLines: string[], startLine: number, endLine: number } | null}
 */
function extractHandlerAt(lines, declLineIdx) {
	const declLine = lines[declLineIdx];
	const constMatch = declLine.match(CONST_HANDLER_RE);
	const fnMatch = declLine.match(FN_HANDLER_RE);
	const name = constMatch?.[1] ?? fnMatch?.[1];
	if (!name || !isHandlerName(name)) return null;

	const bodyStartIdx =
		constMatch && USE_CALLBACK_RE.test(declLine) ? callbackBodyStartIdx(lines, declLineIdx) : declLineIdx;

	const bodyLines = extractBody(lines, bodyStartIdx);
	if (bodyLines.length < MIN_BODY_LINES) return null;

	const startLine = bodyStartIdx + 1;
	const endLine = bodyStartIdx + bodyLines.length;

	return { name, bodyLines, startLine, endLine };
}

/**
 * @param {string[]} lines
 * @returns {{ name: string, bodyLines: string[], startLine: number, endLine: number }[]}
 */
export function detectHandlers(lines) {
	const handlers = [];
	const effectBlocks = buildEffectBlocks(lines);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!CONST_HANDLER_RE.test(line) && !FN_HANDLER_RE.test(line)) continue;

		const startLine = i + 1;
		if (isInsideEffect(startLine, effectBlocks)) continue;

		const handler = extractHandlerAt(lines, i);
		if (!handler) continue;

		if (isInsideEffect(handler.startLine, effectBlocks)) continue;

		handlers.push(handler);
		i = handler.endLine - 1;
	}

	return handlers;
}

function buildFix(target, name) {
	if (target === "useEffect") {
		return `Move "${name}" lifecycle logic into useEffect (or a custom hook that owns the effect).`;
	}
	if (target === "hook") {
		const hookName = `use${name.charAt(0).toUpperCase()}${name.slice(1)}`;
		return `Extract "${name}" to a custom hook (e.g. ${hookName}).`;
	}
	return "Refactor handler per Symphony handler promotion guidelines.";
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * @param {string} source
 * @param {string} filePath
 * @returns {Array<{ file: string, line: number, text: string, message: string, fix: string }>}
 */
export function checkReactHandlers(source, filePath) {
	if (shouldSkipFile(filePath)) return [];

	const lines = source.split("\n");
	const ignored = buildIgnoredLines(lines);
	const violations = [];

	for (const handler of detectHandlers(lines)) {
		if (isRangeIgnored(handler.startLine, handler.endLine, ignored)) continue;

		const result = analyzeHandler(handler.bodyLines, {
			name: handler.name,
			startLine: handler.startLine,
			endLine: handler.endLine,
		});

		if (!result.violation) continue;

		violations.push({
			file: filePath,
			line: handler.startLine,
			text: handler.bodyLines[0]?.trim() ?? "",
			message: result.violation,
			fix: buildFix(result.target, handler.name),
		});
	}

	return violations;
}

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------

runCheckCli(import.meta.url, checkReactHandlers, {
	step: 45,
	name: "check-react-handlers",
	extensions: [".tsx", ".jsx", ".ts", ".js"],
	filter: filePath => {
		const n = filePath.replace(/\\/g, "/");
		if (shouldSkipFile(n)) return false;
		return (
			n.startsWith("capabilities/") ||
			n.startsWith("packages/shell/") ||
			n.includes("/blockiyas/")
		);
	},
});
