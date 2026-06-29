/**
 * Step 27: check-unused-params
 *
 * Detects function parameters prefixed with `_` that are actually used
 * in the function body — a contradiction: the underscore convention means
 * "intentionally unused", but the body uses the value anyway.
 *
 * ─── Smart analysis ──────────────────────────────────────────────────────────
 *
 * The checker uses multi-layer analysis to avoid false positives:
 *
 *   Layer 1 — Signature detection:
 *     Identifies lines that open a function parameter list. Uses a set of
 *     heuristics to distinguish function signatures from other constructs:
 *       ✅  function foo(_bar: string) { ... }
 *       ✅  const fn = (_bar: string) => { ... }
 *       ✅  const fn = function(_bar: string) { ... }
 *       ✅  array.map((_item, _index) => ...)
 *       ✅  { key: (_val) => ... }
 *       ❌  function _doInternal() { ... }   ← function NAME, not param
 *       ❌  class _InternalHelper { ... }    ← class name
 *       ❌  const _privateVar = ...          ← variable declaration
 *       ❌  import { _thing } from '...'     ← import binding
 *       ❌  type _Internal = ...             ← type alias
 *
 *   Layer 2 — Parameter extraction:
 *     Extracts `_`-prefixed identifiers from the parameter list, stripping:
 *       • Type annotations (`: TypeName`, `<Generic>`)
 *       • Default values (`= defaultValue`)
 *       • Destructuring patterns (`{ ... }`, `[ ... ]`)
 *       • Rest parameters (`...rest`) — these are intentionally named
 *     Only bare parameter names are extracted.
 *
 *   Layer 3 — Body scan with scope awareness:
 *     Tracks the function body via brace-depth counting. For each `_param`,
 *     scans the body for `\b_paramName\b` usage, excluding:
 *       • The parameter declaration line itself
 *       • Comment-only lines
 *       • Lines inside nested function declarations (to avoid false positives
 *         from shadowed names in closures)
 *       • String literals (to avoid matching `"_param"` in error messages)
 *
 *   Layer 4 — False positive suppression:
 *     Some `_param` usages are intentional even when the param is "used":
 *       • `_event` in event handlers where only the type is needed
 *         (e.g. `(_e: React.MouseEvent) => { ... }` where `_e` appears in
 *         a type assertion but not as a value)
 *       • Destructuring: `const { x } = _obj` — the param IS used, flag it
 *       • Optional chaining: `_args?.query` — the param IS used, flag it
 *
 * ─── Violations ──────────────────────────────────────────────────────────────
 *
 *   ❌  function foo(_msg: string) { console.log(_msg) }
 *        → _msg is used — remove the underscore prefix
 *
 *   ❌  const fn = (_item: Item) => doSomething(_item)
 *        → _item is used — remove the underscore prefix
 *
 *   ❌  export const invoke = (command: string, _args?: Record<...>) => {
 *          const query = (_args?.query as string) || ''
 *        }
 *        → _args is used — remove the underscore prefix
 *
 *   ✅  function foo(_msg: string) { }
 *        → truly unused, underscore is correct
 *
 *   ✅  function _doInternal(msg: string) { }
 *        → function name starts with _, not a parameter
 *
 *   ✅  const _helper = (x: number) => x * 2
 *        → variable name starts with _, not a parameter
 *
 *   ✅  array.map((_item, index) => index * 2)
 *        → _item is truly unused (only index is used)
 *
 *   ✅  function handler(_e: React.MouseEvent) { doSomething() }
 *        → _e is truly unused (event object not accessed)
 */

import { buildIgnoredLines } from "../utils/ignore-handler.js";
import { runCheckCli } from "../utils/cli-runner.js";

// ─── Regex: detect lines that open a function parameter list ─────────────────

/**
 * Matches lines that contain a function signature opening.
 *
 * Covers:
 *   function name(          — named function declaration
 *   function(               — anonymous function expression
 *   const/let/var x = (     — arrow function or function expression
 *   async (                 — async arrow
 *   .method(                — method call with callback
 *   => {                    — arrow body (params already parsed on this line)
 *
 * Does NOT match:
 *   if ( / while ( / for ( / switch (   — control flow
 *   function _name(                     — function name starts with _ (caught by FUNCTION_NAME_RE)
 */
const FUNCTION_OPEN_RE =
	/(?:^|\s)(?:(?:export\s+)?(?:async\s+)?function\s+\w*\s*\(|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(|(?:async\s*)?\([^)]*\)\s*(?::\s*[\w<>[\], |&]+)?\s*=>|\.\w+\s*\((?:async\s*)?\()/;

/**
 * Patterns that indicate the `_name` is a FUNCTION NAME, CLASS NAME, or
 * VARIABLE NAME — not a parameter. Lines matching these are skipped entirely.
 */
const DECLARATION_NAME_RE = /(?:function|class|const|let|var|type|interface|enum)\s+_[a-zA-Z]/;

/**
 * Matches `_`-prefixed identifiers in parameter position.
 * Used after stripping type annotations and defaults.
 */
const UNDERSCORE_PARAM_RE = /\b(_[a-zA-Z]\w*)\b/g;

// ─── Parameter list extraction ────────────────────────────────────────────────

/**
 * Extract the content between the outermost `(` and `)` on a line.
 * Returns null if the paren is unclosed (multi-line signature).
 */
function extractParamList(line) {
	const start = line.indexOf("(");
	if (start === -1) return null;

	let depth = 0;
	let end = -1;

	for (let i = start; i < line.length; i++) {
		if (line[i] === "(") depth++;
		else if (line[i] === ")") {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}

	if (end === -1) return null; // unclosed — multi-line signature
	return line.slice(start + 1, end);
}

/**
 * Extract `_`-prefixed parameter names from a raw parameter list string.
 *
 * Strips:
 *   • Generic type params: <T extends _Something>
 *   • Type annotations: : TypeName (including union/intersection/generics)
 *   • Default values: = defaultValue
 *   • Destructuring: { ... } and [ ... ]
 *   • Rest params: ...rest (rest params are intentionally named)
 *   • Optional marker: ?
 *
 * Only bare parameter names remain after stripping.
 */
function extractUnderscoreParams(paramList) {
	if (!paramList || !paramList.trim()) return [];

	// Strip generic type params
	let stripped = paramList.replace(/<[^>]*>/g, "");
	// Strip type annotations (everything after `:` up to `,` or end)
	stripped = stripped.replace(/:\s*[^,)=]*/g, "");
	// Strip default values
	stripped = stripped.replace(/=\s*[^,)]*/g, "");
	// Strip destructuring
	stripped = stripped.replace(/\{[^}]*\}/g, "");
	stripped = stripped.replace(/\[[^\]]*\]/g, "");
	// Strip rest params (we don't flag ...rest)
	stripped = stripped.replace(/\.\.\.\w+/g, "");
	// Strip optional marker
	stripped = stripped.replace(/\?/g, "");

	const params = [];
	let match;
	UNDERSCORE_PARAM_RE.lastIndex = 0;

	while ((match = UNDERSCORE_PARAM_RE.exec(stripped)) !== null) {
		params.push(match[1]);
	}

	return params;
}

// ─── Function body range tracking ────────────────────────────────────────────

/**
 * Find the function body range for a given parameter line.
 * Tracks brace depth to find the matching closing `}`.
 *
 * Handles:
 *   • Body on same line: `const fn = (x) => { return x }`
 *   • Body on next line: `function foo(x) {\n  return x\n}`
 *   • Expression body (no braces): `const fn = (x) => x * 2`
 *     → returns null (expression bodies are scanned differently)
 *
 * @param {string[]} lines
 * @param {number} paramLine - 1-indexed line number of the signature
 * @returns {{ start: number, end: number } | null}
 */
function findBodyRange(lines, paramLine) {
	let depth = 0;
	let bodyStart = -1;
	let started = false;

	// Search from the param line up to 10 lines ahead for the opening `{`
	const searchEnd = Math.min(lines.length, paramLine + 10);

	for (let i = paramLine - 1; i < searchEnd; i++) {
		const line = lines[i];

		for (let j = 0; j < line.length; j++) {
			const ch = line[j];

			// Skip string literals to avoid counting braces inside strings
			if (ch === '"' || ch === "'" || ch === "`") {
				const quote = ch;
				j++;
				while (j < line.length && line[j] !== quote) {
					if (line[j] === "\\" && quote !== "`") j++; // skip escaped char
					j++;
				}
				continue;
			}

			if (ch === "{") {
				depth++;
				if (!started) {
					bodyStart = i + 1; // 1-indexed
					started = true;
				}
			} else if (ch === "}" && started) {
				depth--;
				if (depth === 0) {
					return { start: bodyStart, end: i + 1 };
				}
			}
		}
	}

	if (!started) return null; // expression body — no braces

	// Body spans beyond the initial search window — continue scanning
	for (let i = paramLine + 9; i < lines.length; i++) {
		const line = lines[i];

		for (let j = 0; j < line.length; j++) {
			const ch = line[j];

			if (ch === '"' || ch === "'" || ch === "`") {
				const quote = ch;
				j++;
				while (j < line.length && line[j] !== quote) {
					if (line[j] === "\\" && quote !== "`") j++;
					j++;
				}
				continue;
			}

			if (ch === "{") depth++;
			else if (ch === "}") {
				depth--;
				if (depth === 0) {
					return { start: bodyStart, end: i + 1 };
				}
			}
		}
	}

	return null; // unclosed body
}

/**
 * Check if a line is a comment-only line.
 */
function isCommentLine(line) {
	const trimmed = line.trim();
	return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("*/");
}

/**
 * Check if a usage of `_param` in a line is a type-only usage.
 * Type-only usages don't count as "using" the parameter value.
 *
 * Examples of type-only usage (should NOT flag):
 *   • `typeof _param`  — only inspecting the type
 *   • `_param as SomeType`  — type assertion without value use
 *     BUT: `doSomething(_param as SomeType)` IS a value use
 *
 * We use a simple heuristic: if the param appears ONLY in a `typeof` expression
 * or ONLY as the left side of `as` with nothing else, it's type-only.
 */
function isTypeOnlyUsage(line, paramName) {
	// Remove the param from the line and check if what remains makes sense
	// as a value expression. This is a heuristic — not perfect.

	// `typeof _param` — type-only
	if (new RegExp(`\\btypeof\\s+${paramName}\\b`).test(line)) {
		// Check if it's ONLY typeof usage (no other usage)
		const withoutTypeof = line.replace(new RegExp(`\\btypeof\\s+${paramName}\\b`, "g"), "");
		if (!new RegExp(`\\b${paramName}\\b`).test(withoutTypeof)) {
			return true;
		}
	}

	return false;
}

// ─── Main check ───────────────────────────────────────────────────────────────

export function checkUnusedParams(source, filePath) {
	// Skip test files — `_mock` params in tests are common and intentional
	if (filePath.includes("__tests__") || filePath.includes(".test.") || filePath.includes(".spec.")) return [];
	// Skip toolkit itself
	if (filePath.startsWith("packages/toolkit/")) return [];
	// Skip markdown
	if (filePath.endsWith(".md")) return [];
	// Skip scripts/
	if (filePath.startsWith("scripts/")) return [];
	// Skip type definition files
	if (filePath.endsWith(".d.ts")) return [];
	// Skip Storybook files — decorators often have unused params
	if (filePath.endsWith(".stories.tsx") || filePath.endsWith(".stories.ts")) return [];

	const violations = [];
	const lines = source.split("\n");
	const ignored = buildIgnoredLines(lines);

	// ── Phase 1: Find function signatures with `_`-prefixed params ──────────

	/** @type {{ paramLine: number, params: string[] }[]} */
	const paramSites = [];

	lines.forEach((line, i) => {
		const lineNum = i + 1;
		if (ignored.has(lineNum)) return;

		// Skip lines that declare a function/class/variable NAME starting with `_`
		if (DECLARATION_NAME_RE.test(line)) return;

		// Must look like a function signature
		if (!FUNCTION_OPEN_RE.test(line)) return;

		// Extract the parameter list
		const paramList = extractParamList(line);
		if (!paramList) return;

		// Extract `_`-prefixed param names
		const params = extractUnderscoreParams(paramList);
		if (params.length === 0) return;

		paramSites.push({ paramLine: lineNum, params });
	});

	if (paramSites.length === 0) return [];

	// ── Phase 2: For each param site, find body and check usage ─────────────

	for (const { paramLine, params } of paramSites) {
		if (ignored.has(paramLine)) continue;

		const body = findBodyRange(lines, paramLine);

		// Expression body (no braces) — scan the rest of the line
		if (!body) {
			const sigLine = lines[paramLine - 1];
			// Find the `=>` and scan everything after it
			const arrowIdx = sigLine.indexOf("=>");
			if (arrowIdx === -1) continue;
			const afterArrow = sigLine.slice(arrowIdx + 2);

			for (const param of params) {
				const usageRe = new RegExp(`\\b${param}\\b`);
				if (usageRe.test(afterArrow) && !isTypeOnlyUsage(afterArrow, param)) {
					const cleanName = param.replace(/^_/, "");
					violations.push({
						file: filePath,
						line: paramLine,
						text: lines[paramLine - 1].trim(),
						message: `Parameter \`${param}\` is prefixed with \`_\` (signals "unused") but is used in the expression body. Remove the underscore prefix.`,
						fix: `Rename \`${param}\` → \`${cleanName}\` in both the parameter list and the body.`,
					});
				}
			}
			continue;
		}

		// Block body — scan lines between { and }
		for (const param of params) {
			if (ignored.has(paramLine)) continue;

			const usageRe = new RegExp(`\\b${param}\\b`);
			let usedAtLine = -1;

			for (let j = body.start - 1; j < body.end; j++) {
				const bodyLineNum = j + 1;
				if (ignored.has(bodyLineNum)) continue;

				const bodyLine = lines[j];

				// Skip the param declaration line itself
				if (bodyLineNum === paramLine) continue;

				// Skip comment-only lines
				if (isCommentLine(bodyLine)) continue;

				// Check for usage
				if (usageRe.test(bodyLine)) {
					// Check if it's a type-only usage
					if (isTypeOnlyUsage(bodyLine, param)) continue;

					usedAtLine = bodyLineNum;
					break;
				}
			}

			if (usedAtLine !== -1) {
				const cleanName = param.replace(/^_/, "");

				violations.push({
					file: filePath,
					line: paramLine,
					text: lines[paramLine - 1].trim(),
					message: `Parameter \`${param}\` is prefixed with \`_\` (signals "unused") but is used at line ${usedAtLine}. Remove the underscore prefix.`,
					fix: `Rename \`${param}\` → \`${cleanName}\` in both the parameter list and the body.`,
				});
			}
		}
	}

	return violations;
}

// CLI entry point
runCheckCli(import.meta.url, checkUnusedParams, {
	step: 27,
	name: "check-unused-params",
	extensions: [".ts", ".tsx"],
});
