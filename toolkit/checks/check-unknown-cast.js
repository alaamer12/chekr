/**
 * Step 26: check-unknown-cast
 *
 * Detects `x as unknown as T` double-cast patterns — a lazy escape hatch
 * that silences TypeScript without actually fixing the underlying type mismatch.
 *
 * ─── Smart analysis ──────────────────────────────────────────────────────────
 *
 * Not all double-casts are bugs. The checker distinguishes three categories:
 *
 *   INTENTIONAL — token/bridge infrastructure where the cast IS the correct
 *   pattern. These files implement the type system itself:
 *     • Token factories: `new SizeTokenImpl(...) as unknown as SizeToken`
 *       The impl class satisfies the brand at runtime but TS can't see it.
 *     • Token factories: `new ColorTokenImpl(...) as unknown as ColorToken`
 *       Same pattern — branded-string type requires the cast at the factory.
 *     • Generic type narrowing in resolveTokens<T>: `str as unknown as T`
 *       The function has already confirmed the value is the right shape.
 *     • Component registry widening: `Comp as unknown as ComponentType<Record<...>>`
 *       The registry accepts any component — widening to the base type is correct.
 *     • React element type narrowing in serializer utilities.
 *
 *   CONTEXT-AWARE — casts that are acceptable in specific contexts:
 *     • `as unknown as T` immediately after a runtime validation function call
 *       (e.g. after JSON.parse + validation) — single `as T` is preferred but
 *       `as unknown as T` is tolerated if the validation is on the line above.
 *     • `as unknown as number` for `setTimeout` return type — Node.js returns
 *       `NodeJS.Timeout`, browser returns `number`. The correct fix is
 *       `ReturnType<typeof setTimeout>` but the cast is a known workaround.
 *       FLAGGED with a more specific message pointing to the correct fix.
 *
 *   VIOLATIONS — everything else: lazy casts that bypass type safety without
 *   fixing the underlying mismatch.
 *
 * ─── Detection ───────────────────────────────────────────────────────────────
 *
 * The checker uses three layers of analysis:
 *
 *   Layer 1 — File-level exclusions:
 *     Files that implement the token/bridge type system are excluded entirely.
 *     These are identified by path pattern + a confirming content marker.
 *
 *   Layer 2 — Line-level context:
 *     For each `as unknown as T` match, inspect the surrounding context:
 *     - Is it inside a factory function that returns the branded type?
 *     - Is it a generic type parameter `T` (resolveTokens pattern)?
 *     - Is it a ComponentType widening in a registerComponent call?
 *     - Is it a `setTimeout` return cast (flag with specific message)?
 *
 *   Layer 3 — Suppression:
 *     @symphony-ignore-start/end blocks suppress any remaining false positives.
 *
 * ─── Violations ──────────────────────────────────────────────────────────────
 *
 *   ❌  config as unknown as NodeConfig          ← missing required fields
 *   ❌  result as unknown as Connection          ← missing required fields
 *   ❌  {} as unknown as SomeType                ← empty object cast
 *   ❌  parsed as unknown as TabSession          ← use `as TabSession` after validation
 *   ⚠️  setTimeout(...) as unknown as number    ← use ReturnType<typeof setTimeout>
 *
 *   ✅  new SizeTokenImpl(...) as unknown as SizeToken   ← token factory (intentional)
 *   ✅  new ColorTokenImpl(...) as unknown as ColorToken  ← token factory (intentional)
 *   ✅  str as unknown as T                              ← generic narrowing (intentional)
 *   ✅  Comp as unknown as ComponentType<Record<...>>    ← registry widening (intentional)
 */

import { buildIgnoredLines } from "../utils/ignore-handler.js";
import { runCheckCli } from "../utils/cli-runner.js";

// ─── File-level exclusions ────────────────────────────────────────────────────

/**
 * Files that implement the token/bridge type system.
 * Casts in these files are the correct pattern — the impl class satisfies
 * the branded type at runtime but TypeScript can't verify it statically.
 *
 * Each entry is { path: string, marker: RegExp } — the file must match BOTH
 * the path pattern AND contain the confirming marker to be excluded.
 */
const FILE_EXCLUSIONS = [
	// SizeToken factory: `new SizeTokenImpl(...) as unknown as SizeToken`
	{
		pathPattern: "tokens/SizeToken",
		marker: /class SizeTokenImpl implements SizeTokenBrand/,
		reason: "SizeToken factory — impl class satisfies brand at runtime",
	},
	// ColorToken factory: `new ColorTokenImpl(...) as unknown as ColorToken`
	{
		pathPattern: "tokens/ColorToken",
		marker: /class ColorTokenImpl implements ColorTokenBrand/,
		reason: "ColorToken factory — impl class satisfies brand at runtime",
	},
	// variant.ts resolveTokens<T>: `str as unknown as T`
	{
		pathPattern: "primitives/base/utils/variant",
		marker: /function resolveTokens<T>/,
		reason: "resolveTokens<T> — generic narrowing after runtime type check",
	},
	// thebridge component registry: `Comp as unknown as ComponentType<Record<...>>`
	{
		pathPattern: "thebridge/src/registration/initPrimitives",
		marker: /registerComponent\(/,
		reason: "Component registry — widening to ComponentType<Record<string, unknown>>",
	},
	// thebridge serializer: React element type narrowing
	{
		pathPattern: "thebridge/src/utils/serializer",
		marker: /function serializeComponent/,
		reason: "React element serializer — type narrowing after isReactElement guard",
	},
];

// ─── Line-level context patterns ──────────────────────────────────────────────

/**
 * Patterns that indicate a cast is intentional even outside excluded files.
 * These are checked against the line containing the cast.
 */
const INTENTIONAL_LINE_PATTERNS = [
	// Generic type parameter T — resolveTokens-style pattern
	/\bas\s+unknown\s+as\s+T\b/,
	// ComponentType widening — any component registry pattern
	/as\s+unknown\s+as\s+React\.ComponentType/,
	// Branded type factory — `new XxxImpl(...)` pattern
	/new\s+\w+Impl\s*\([^)]*\)\s+as\s+unknown\s+as/,
];

/**
 * setTimeout cast — technically wrong but a known workaround.
 * Flag with a specific message pointing to the correct fix.
 */
const SETTIMEOUT_CAST_RE = /setTimeout\s*\([^)]*\)\s+as\s+unknown\s+as\s+number/;

// ─── Main pattern ─────────────────────────────────────────────────────────────

/**
 * Matches `as unknown as <TypeName>` anywhere on a line.
 * Captures the target type name for a better error message.
 */
const UNKNOWN_CAST_RE = /\bas\s+unknown\s+as\s+(\w[\w.<>, |&[\]]*)/;

// ─── Check function ───────────────────────────────────────────────────────────

export function checkUnknownCast(source, filePath) {
	// Skip test files — casts in tests are often intentional fixture shortcuts
	if (filePath.includes("__tests__") || filePath.includes(".test.") || filePath.includes(".spec.")) return [];
	// Skip toolkit itself
	if (filePath.startsWith("packages/toolkit/")) return [];
	// Skip markdown docs
	if (filePath.endsWith(".md")) return [];
	// Skip scripts/ — migration/fix scripts legitimately use casts
	if (filePath.startsWith("scripts/")) return [];
	// Skip type definition files
	if (filePath.endsWith(".d.ts")) return [];

	// ── Layer 1: File-level exclusions ────────────────────────────────────────
	for (const exclusion of FILE_EXCLUSIONS) {
		if (filePath.includes(exclusion.pathPattern) && exclusion.marker.test(source)) {
			return []; // Entire file is intentional — skip
		}
	}

	const violations = [];
	const lines = source.split("\n");
	const ignored = buildIgnoredLines(lines);

	lines.forEach((line, i) => {
		const lineNum = i + 1;
		if (ignored.has(lineNum)) return;

		const match = line.match(UNKNOWN_CAST_RE);
		if (!match) return;

		const targetType = match[1].trim();

		// ── Layer 2: Line-level context ───────────────────────────────────────

		// Check intentional patterns — skip silently
		for (const pattern of INTENTIONAL_LINE_PATTERNS) {
			if (pattern.test(line)) return;
		}

		// setTimeout cast — flag with specific message
		if (SETTIMEOUT_CAST_RE.test(line)) {
			violations.push({
				file: filePath,
				line: lineNum,
				text: line.trim(),
				message: `\`setTimeout(...) as unknown as number\` — use \`ReturnType<typeof setTimeout>\` for the ref type instead of casting the return value.`,
				fix: `Change useRef<number | null> to useRef<ReturnType<typeof setTimeout> | null> and remove the cast.`,
			});
			return;
		}

		// General violation
		violations.push({
			file: filePath,
			line: lineNum,
			text: line.trim(),
			message: `\`as unknown as ${targetType}\` — double-cast bypasses type safety. Fix the underlying type mismatch instead.`,
			fix: `Narrow the type properly (type guard / switch / satisfies) or add missing required fields. If intentional, wrap in @symphony-ignore-start/end with a comment explaining why.`,
		});
	});

	return violations;
}

// CLI entry point
runCheckCli(import.meta.url, checkUnknownCast, {
	step: 26,
	name: "check-unknown-cast",
	extensions: [".ts", ".tsx"],
});
