/**
 * Step 40: check-typia-validation
 *
 * Enforces Symphony runtime validation via typia instead of ad-hoc type guards and assertion returns.
 *
 * Rule A — No `instanceof` / `typeof` for type narrowing (when enabled):
 *   ❌ `value instanceof DomainClass` — use typia discriminated unions / tags
 *   ❌ `typeof x === "string"` — use `typia.is<T>()` or `typia.createValidate<T>()`
 *   ✅ `err instanceof Error` — allowed error handling
 *   ✅ `e instanceof HTMLElement` (and common DOM/Event types)
 *   ✅ `typeof window`, `typeof import.meta`, `typeof setTimeout` (environment probes)
 *   ✅ `typeof x === "undefined"` — undefined checks (not Typia schema targets)
 *
 * Rule B — No unsafe `return … as Type` (when enabled):
 *   ❌ `return foo as Bar` / `return (expr) as Type`
 *   ✅ `return x as const`
 *   ✅ `as unknown as T` — covered by check-unknown-cast (step 26); not duplicated here
 *
 * Rule C — No hand-written `isXxx` type predicates (when enabled):
 *   ❌ `function isUser(input: unknown): input is User { … }`
 *   ❌ `const isUser = (input: unknown): input is User => …`
 *   ✅ `const isUser = typia.createIs<User>()` — compile-time validator (rejects extra properties)
 *   ✅ `typia.is<T>()`, `typia.createValidate<T>()`, `typia.createAssert<T>()`
 *   ✅ React/UI booleans (`isLoading`, `isOpen`) without `param is Type` return
 *
 * Allowed paths:
 *   packages/primitives/, packages/toolkit/, node_modules
 *   Test/spec/story files (excluded from scan)
 *   @symphony-ignore blocks with documented reason
 *
 * Migrate to typia — see:
 *   capabilities/ai-orchestration/panels/conductor/utils/validatePayload.ts
 *   capabilities/configuration/panels/settings/schema.ts
 */

import { readFileSync } from "node:fs";
import { buildIgnoredLines } from "../utils/ignore-handler.js";
import { walkFiles } from "../utils/file-walker.js";
import { matchesScope } from "../utils/scope-matcher.js";
import { isMainEntryPoint } from "../utils/path-utils.js";
import { pass, fail } from "../utils/colors.js";
import { printViolations, writeReport } from "../utils/reporter.js";

/** Toggle individual rules without removing detection logic. */
export const RULES = {
	banInstanceof: { enabled: true },
	banTypeofGuards: { enabled: true },
	banReturnAsAssertion: { enabled: true },
	banManualTypePredicates: { enabled: true },
};

const SCOPE = ["capabilities/", "apps/", "packages/"];
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

const ALLOWED_PATH_PREFIXES = ["packages/toolkit/", "packages/primitives/", "packages/thebridge/"];

const SKIP_PATH_SEGMENTS = ["/node_modules/", "/dist/", "/build/", "/target/", "/.turbo/", "/coverage/", "/__mocks__/"];

/** `instanceof` RHS types allowed without typia (errors, DOM, fetch primitives). */
const INSTANCEOF_ALLOWED = new Set([
	"Error",
	"AggregateError",
	"DOMException",
	"TypeError",
	"RangeError",
	"SyntaxError",
	"ReferenceError",
	"HTMLElement",
	"Element",
	"SVGElement",
	"Node",
	"Event",
	"MouseEvent",
	"KeyboardEvent",
	"PointerEvent",
	"TouchEvent",
	"FocusEvent",
	"InputEvent",
	"CustomEvent",
	"HTMLInputElement",
	"HTMLDivElement",
	"HTMLFormElement",
	"HTMLAnchorElement",
	"HTMLButtonElement",
	"HTMLSelectElement",
	"HTMLTextAreaElement",
	"HTMLLinkElement",
	"URL",
	"Blob",
	"File",
	"FormData",
	"Response",
	"Request",
	"AbortController",
	"AbortSignal",
]);

const TYPIA_GUARD_FIX =
	"Prefer typia: `const isT = typia.createIs<T>()`, `typia.is<T>(value)`, `typia.createValidate<T>()`, `typia.validate<T>()`, or `typia.assert<T>()`. " +
	"For discriminated unions use typia tags / custom validators. See validatePayload.ts and settings/schema.ts.";

const TYPIA_CREATE_IS_FIX =
	"Prefer `const isUser = typia.createIs<User>()` instead of a hand-written `isUser` guard. " +
	"`createIs` rejects extra properties (loose manual `typeof` / `in` checks do not); use `typia.createEquals<T>()` when you need exact structural equality. " +
	"Requires the typia transformer: `@typia/unplugin` (Vite), or tsconfig `plugins` + `ts-patch` (tsc). " +
	"Also: `typia.createValidate<T>()` / `typia.validate<T>()` (errors), `typia.createAssert<T>()` / `typia.assert<T>()` (throw), `typia.is<T>(input)` (one-shot). " +
	"See validatePayload.ts and settings/schema.ts.";

const TYPIA_RETURN_FIX =
	"Validate at the boundary: `return typia.assert<Bar>(foo)` or narrow with `typia.is<Bar>()` before return. " +
	"For JSON use `typia.json.assertParse<T>()`. Double-casts (`as unknown as T`) are flagged by check-unknown-cast (step 26).";

const INSTANCEOF_RE = /(\w[\w$.[\]]*)\s+instanceof\s+([\w.]+)/g;

const TYPEOF_GUARD_RE =
	/typeof\s+[\w$.[\]]+\s*(?:===|!==|==|!=)\s*['"](?:string|number|boolean|bigint|symbol|object|function)['"]|['"](?:string|number|boolean|bigint|symbol|object|function)['"]\s*(?:===|!==|==|!=)\s*typeof\s+[\w$.[\]]+/;

const TYPEOF_UNDEFINED_GUARD_RE =
	/typeof\s+[\w$.[\]]+\s*(?:===|!==|==|!=)\s*['"]undefined['"]|['"]undefined['"]\s*(?:===|!==|==|!=)\s*typeof\s+[\w$.[\]]+/;

const TYPEOF_ENV_IDENT =
	/typeof\s+(?:window|globalThis|document|import\.meta|setTimeout|clearTimeout|process|navigator|self)\b/;

/**
 * `return expr as Type` — not `as const`, not `as unknown as` (step 26), not object-literal returns with inner casts.
 */
const RETURN_AS_RE =
	/\breturn\s+(?:await\s+)?(?:\([^;]*?\)|\[[^\]]*\]|[\w$][\w$.?[\]]*)\s+as\s+(?!const\b|unknown\s+as)/;

/** `param is SomeType` user-defined type predicate return. */
const TYPE_PREDICATE_RETURN_RE = /:\s*[\w$]+\s+is\s+[\w$.[\]<>,\s|&?]+/;

/** typia factories / one-shot validators (allowed). */
const TYPIA_VALIDATOR_RE = /\btypia\.(?:createIs|createValidate|createAssert|is|assert|validate)\s*(?:<|\()/;

/**
 * React/UI state names that are almost always booleans, not domain type predicates.
 * Only used to skip `const isXxx = …` assignments without a type-predicate signature.
 */
const REACT_UI_BOOLEAN_IS_NAMES = new Set([
	"isLoading",
	"isOpen",
	"isMounted",
	"isVisible",
	"isDisabled",
	"isActive",
	"isPending",
	"isError",
	"isSuccess",
	"isFetching",
	"isHovered",
	"isFocused",
	"isSelected",
	"isExpanded",
	"isCollapsed",
	"isDragging",
	"isEditing",
	"isSubmitting",
	"isDirty",
	"isTouched",
	"isChecked",
	"isFullscreen",
	"isConnected",
	"isOnline",
	"isReady",
	"isBusy",
	"isAnimating",
	"isTransitioning",
]);

function isTestOrStoryFile(filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	return (
		normalised.includes("__tests__") ||
		normalised.includes(".test.") ||
		normalised.includes(".spec.") ||
		normalised.includes(".stories.")
	);
}

function shouldScanSourceFile(filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	if (!matchesScope(normalised, SCOPE)) return false;
	if (!CODE_EXTENSIONS.some(ext => normalised.endsWith(ext))) return false;
	if (SKIP_PATH_SEGMENTS.some(seg => normalised.includes(seg))) return false;
	if (ALLOWED_PATH_PREFIXES.some(prefix => normalised.startsWith(prefix))) return false;
	if (isTestOrStoryFile(normalised)) return false;
	return true;
}

function extractTypeofIdentifier(line) {
	const forward = line.match(/typeof\s+([\w$.[\]]+)\s*(?:===|!==|==|!=)/);
	if (forward) return forward[1].split(/[.[\]]/)[0];
	const reverse = line.match(
		/['"](?:string|number|boolean|bigint|symbol|object|function)['"]\s*(?:===|!==|==|!=)\s*typeof\s+([\w$.[\]]+)/
	);
	return reverse ? reverse[1].split(/[.[\]]/)[0] : null;
}

/** Skip typeof guards on params already typed as concrete TS types (not unknown/any). */
function isTypeofOnConcreteTypedParam(source, line) {
	const ident = extractTypeofIdentifier(line);
	if (!ident) return false;
	const re = new RegExp(`\\b${ident}\\b\\s*:\\s*(?!unknown\\b|any\\b)([^,)\\]=\\n{]+)`, "g");
	for (const match of source.matchAll(re)) {
		const type = match[1].trim();
		if (type.length > 0) return true;
	}
	return false;
}

/** Standard unknown → object/null guard before field walks (not schema narrowing). */
function isObjectNullGuardLine(line) {
	return (
		/!\s*\w+\s*\|\|\s*typeof\s+\w+\s*!==\s*['"]object['"]/.test(line) ||
		/typeof\s+\w+\s*!==\s*['"]object['"]/.test(line) ||
		(/typeof\s+\w+\s*===\s*['"]object['"]/.test(line) && /!==\s*null|\!\s*Array\.isArray/.test(line))
	);
}

/** Field validators on Record<string, unknown> payloads (manual pipeline until typia migration). */
function isRecordPropertyGuard(source, line) {
	const m = line.match(/typeof\s+([\w]+)\.[\w[\]]+/);
	if (!m) return false;
	const root = m[1];
	return new RegExp(
		`\\b${root}\\b\\s*(?:=[^;]*)?\\bas\\s+Record<string,\\s*unknown>|: Record<string,\\s*unknown>`
	).test(source);
}

/** Duck-typing optional methods (`cancel`, `flush`) on library objects. */
function isFunctionPresenceCheck(line) {
	return /typeof\s+[\w$.[\]]+\s*(?:===|!==|==|!=)\s*['"]function['"]|['"]function['"]\s*(?:===|!==|==|!=)\s*typeof\s+[\w$.[\]]+/.test(
		line
	);
}

function hasTypiaValidatorNearby(lines, lineIndex, radius = 3) {
	const start = Math.max(0, lineIndex - radius);
	const end = Math.min(lines.length, lineIndex + radius + 1);
	return lines.slice(start, end).some(l => TYPIA_VALIDATOR_RE.test(l));
}

function extractIsPrefixedName(line) {
	const fn = line.match(/\bfunction\s+(is[A-Z]\w*)\b/);
	if (fn) return fn[1];
	const cnst = line.match(/\bconst\s+(is[A-Z]\w*)\s*=/);
	return cnst ? cnst[1] : null;
}

/** Closing `)` of a split signature: `): value is User {`. */
function isSplitTypePredicateSignatureLine(line) {
	return /^\s*\)\s*:\s*[\w$]+\s+is\s+/.test(line);
}

/**
 * Hand-written `isXxx` with `param is T` return (not typia.createIs).
 * @param {string[]} lines
 * @param {number} lineIndex
 */
function findManualTypePredicateViolation(lines, lineIndex) {
	const line = lines[lineIndex];
	if (!TYPE_PREDICATE_RETURN_RE.test(line)) return null;

	if (TYPIA_VALIDATOR_RE.test(line) || hasTypiaValidatorNearby(lines, lineIndex)) {
		return null;
	}

	const nameOnLine = extractIsPrefixedName(line);
	if (nameOnLine) {
		const window = lines.slice(Math.max(0, lineIndex - 15), Math.min(lines.length, lineIndex + 30)).join("\n");
		if (TYPIA_VALIDATOR_RE.test(window) || /\bgetCheck\w+Brand\b/.test(window)) return null;
		
		return nameOnLine;
	}

	if (isSplitTypePredicateSignatureLine(line)) {
		const window = lines.slice(Math.max(0, lineIndex - 10), lineIndex + 1).join("\n");
		if (TYPIA_VALIDATOR_RE.test(window)) return null;
		const splitName = window.match(/\bfunction\s+(is[A-Z]\w*)\s*\(/);
		return splitName ? splitName[1] : null;
	}

	const lookback = lines.slice(Math.max(0, lineIndex - 3), lineIndex + 1).join("\n");
	const arrowName = lookback.match(/\bconst\s+(is[A-Z]\w*)\s*=\s*(?:async\s*)?\(/);
	if (arrowName && !hasTypiaValidatorNearby(lines, lineIndex, 5)) {
		return arrowName[1];
	}

	return null;
}

/** Manual runtime checks in `const isXxx = …` RHS (same line or arrow body). */
const MANUAL_GUARD_RHS_RE =
	/typeof\s+|!==\s*null|===\s*null|\bin\s+[\w$]+|Array\.isArray|Object\.prototype\.hasOwnProperty/;

/**
 * `const isUser = …` where RHS is manual guard logic (not typia, not UI boolean state).
 * @param {string[]} lines
 * @param {number} lineIndex
 */
function findManualIsConstAssignmentViolation(lines, lineIndex) {
	const line = lines[lineIndex];
	const m = line.match(/\bconst\s+(is[A-Z]\w*)\s*=/);
	if (!m) return null;
	const name = m[1];
	if (TYPE_PREDICATE_RETURN_RE.test(line)) return null;
	if (REACT_UI_BOOLEAN_IS_NAMES.has(name)) return null;
	if (name.endsWith("Atom")) return null;
	if (TYPIA_VALIDATOR_RE.test(line) || hasTypiaValidatorNearby(lines, lineIndex)) return null;

	const rhsStart = line.slice(line.indexOf("=") + 1);
	const rhsWindow = [rhsStart, ...lines.slice(lineIndex + 1, lineIndex + 6)].join("\n");
	if (/\.\s*some\s*\(/.test(rhsWindow)) return null;
	if (/\batom\s*[<(]/.test(rhsWindow)) return null;
	if (/useState|useMemo|useRef|useCallback|useReducer|useBoolean|useToggle/.test(rhsWindow)) {
		return null;
	}
	if (MANUAL_GUARD_RHS_RE.test(rhsWindow)) {
		return name;
	}
	return null;
}

/** Allow `return … as T` after typia success, validated envelopes, or generic storage reads. */
function isAllowedReturnCast(source, lineIndex, line) {
	if (/\breturn\s+\{\s*ok:\s*true\s*,\s*data:/.test(line)) return true;
	if (/\breturn\s+\([^)]*\)\s*as\s+/.test(line) && /\?\?\s*\[\]/.test(line)) return true;
	if (/\breturn\s+sessionDb\.data/.test(line)) return true;
	const prev = source
		.split("\n")
		.slice(Math.max(0, lineIndex - 10), lineIndex)
		.join("\n");
	return /\b(?:result|validation)\.success\b/.test(prev) || /\btypia\.(?:is|assert|validate)\b/.test(prev);
}

function isCommentOnlyLine(trimmed) {
	return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("{/*");
}

function formatViolation(filePath, lineNum, text, message, fix) {
	return {
		file: filePath,
		line: lineNum,
		text: text.trim(),
		message,
		fix,
	};
}

/**
 * @param {string} source
 * @param {string} filePath
 * @returns {import('../utils/reporter.js').Violation[]}
 */
export function checkTypiaValidation(source, filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	if (!shouldScanSourceFile(normalised)) return [];

	const violations = [];
	const lines = source.split("\n");
	const ignored = buildIgnoredLines(lines);

	lines.forEach((line, i) => {
		const lineNum = i + 1;
		if (ignored.has(lineNum)) return;

		const trimmed = line.trim();
		if (isCommentOnlyLine(trimmed)) return;

		if (RULES.banInstanceof.enabled) {
			for (const match of line.matchAll(INSTANCEOF_RE)) {
				const rhs = match[2];
				if (INSTANCEOF_ALLOWED.has(rhs)) continue;

				violations.push(
					formatViolation(
						filePath,
						lineNum,
						trimmed,
						`\`instanceof ${rhs}\` is a runtime type guard — Symphony uses typia for consistent, schema-driven validation (compile-time types → runtime checks).`,
						TYPIA_GUARD_FIX
					)
				);
			}
		}

		if (RULES.banTypeofGuards.enabled) {
			if (TYPEOF_ENV_IDENT.test(line)) {
				// Environment / host probes — not Typia narrowing targets
			} else if (TYPEOF_UNDEFINED_GUARD_RE.test(line)) {
				// `typeof x === "undefined"` allowed
			} else if (TYPEOF_GUARD_RE.test(line)) {
				if (
					isTypeofOnConcreteTypedParam(source, line) ||
					isObjectNullGuardLine(line) ||
					isRecordPropertyGuard(source, line) ||
					isFunctionPresenceCheck(line)
				) {
					// Redundant typed-param guard, object/null probe, or Record field pipeline
				} else {
					violations.push(
						formatViolation(
							filePath,
							lineNum,
							trimmed,
							'`typeof … === "string"|"object"|…` narrows types at runtime without a schema — prefer typia validators derived from TypeScript types for safety and consistency.',
							TYPIA_GUARD_FIX
						)
					);
				}
			}
		}

		if (RULES.banReturnAsAssertion.enabled && RETURN_AS_RE.test(line)) {
			if (isAllowedReturnCast(source, i, line)) {
				// Post-typia validated return envelope
			} else {
				violations.push(
					formatViolation(
						filePath,
						lineNum,
						trimmed,
						"`return … as Type` asserts the return type without runtime validation — callers may receive invalid data. Validate with typia before returning.",
						TYPIA_RETURN_FIX
					)
				);
			}
		}

		if (RULES.banManualTypePredicates.enabled) {
			const predicateName = findManualTypePredicateViolation(lines, i);
			if (predicateName) {
				violations.push(
					formatViolation(
						filePath,
						lineNum,
						trimmed,
						`Manual type predicate \`${predicateName}\` with \`param is Type\` — prefer typia \`createIs\` for schema-driven checks that reject extra properties.`,
						TYPIA_CREATE_IS_FIX
					)
				);
			} else {
				const constName = findManualIsConstAssignmentViolation(lines, i);
				if (constName) {
					violations.push(
						formatViolation(
							filePath,
							lineNum,
							trimmed,
							`Manual guard assigned to \`${constName}\` — use \`const ${constName} = typia.createIs<YourType>()\` instead of hand-rolled checks.`,
							TYPIA_CREATE_IS_FIX
						)
					);
				}
			}
		}
	});

	return violations;
}

if (isMainEntryPoint(import.meta.url)) {
	const args = process.argv.slice(2);
	const reportPath = args.find(arg => arg.startsWith("--report="))?.split("=")[1];
	const scanPath = args.find(arg => !arg.startsWith("--")) || ".";

	const violations = walkFiles(scanPath, CODE_EXTENSIONS)
		.filter(shouldScanSourceFile)
		.flatMap(file => {
			const source = readFileSync(file, "utf8");
			return checkTypiaValidation(source, file);
		});

	if (violations.length === 0) {
		console.log(pass("✅ No typia-validation violations found"));
		process.exit(0);
	}

	console.log(fail(`❌ ${violations.length} typia-validation violations found\n`));
	printViolations(violations);

	if (reportPath) {
		writeReport(reportPath, {
			steps: [{ step: 40, name: "check-typia-validation", status: "fail", violations }],
			timestamp: new Date().toISOString(),
			mode: "single-check",
			passed: false,
			totalViolations: violations.length,
		});
	}

	process.exit(1);
}
