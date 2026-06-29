/**
 * Step 37: check-react-srp
 *
 * Flags React components that may benefit from SRP review — split only when it
 * reduces shared reactive dependencies (see .repertoire/v2/reference/react-srp.md).
 * LOC threshold is a hotspot hint, not an automatic split mandate.
 */

import { buildIgnoredLines } from "../utils/ignore-handler.js";
import { detectComponents } from "../utils/react-loc-counter.js";
import { runCheckCli } from "../utils/cli-runner.js";

// ---------------------------------------------------------------------------
// Production toggles — only locThreshold emits violations by default
// ---------------------------------------------------------------------------

export const SRP_CONDITIONS = {
	locThreshold: { enabled: true, maxLines: 80 },
	sectionComments: { enabled: false, minSections: 2 },
	conditionalBranches: { enabled: false, minBranches: 2 },
};

// ---------------------------------------------------------------------------
// CONFIG — thresholds and weights (tune here; toggles above gate checks)
// ---------------------------------------------------------------------------

export const CONFIG = {
	// --- LOC (mirrors SRP_CONDITIONS.locThreshold.maxLines) ---
	locThreshold: SRP_CONDITIONS.locThreshold.maxLines,
	locHookHeavy: 120, // higher bar for hook-heavy components (+1 signal)
	locPresentationalCeiling: 300, // even no-hook components get flagged above this

	// --- JSX token inflation ---
	// Token-style props (space.sm, color.textPrimary, fontSize.xs) inflate LOC
	// without adding complexity. Subtract them before LOC decisions.
	tokenPropRatio: 0.35, // if >35% of body lines are pure token props, apply deflation
	tokenDeflationFactor: 0.7, // deflated LOC = raw LOC * 0.7

	// --- Signals required to fire a violation ---
	minSignalScore: 2, // score must reach this before a violation is emitted

	// --- Signal weights ---
	signals: {
		ifBranches: 1, // 2+ independent <If> scopes
		sectionMarkersWithBranches: 1, // section markers AND 2+ branches together
		hookHeavyLoc: 1, // hooks present AND loc >= locHookHeavy
		multipleEffects: 1, // 2+ useEffect calls (independent side-effect scopes)
		multipleStateAtoms: 1, // 3+ useState calls (independent reactive atoms)
		contextDiversity: 1, // 3+ different context hooks consumed
		nestedTernaries: 1, // 2+ nested ternary branches (hidden conditionals)
		highPropCount: 1, // prop count >= propCountThreshold
		importDomainDiversity: 1, // 4+ distinct import domain paths
	},

	// --- Per-signal thresholds ---
	minIfBranches: 2,
	minSectionMarkers: 2,
	minEffectCalls: 2, // useEffect count that signals independent concerns
	minStateAtoms: 3, // useState count that signals independent reactive atoms
	minContextHooks: 3, // distinct context hook calls that signal scope coupling
	minNestedTernaryDepth: 2, // ternary nesting depth considered a hidden branch
	minNestedTernaryCount: 2, // how many nested ternary expressions to fire signal
	propCountThreshold: 10, // props beyond this = too many caller concerns
	importDomainThreshold: 4, // distinct first-level import domains to fire signal

	// --- Suppression ---
	jsxRatioForLayout: 0.55, // >= this fraction of lines being JSX = layout component
	minLinesForJsxRatio: 10, // minimum body lines before JSX ratio is meaningful
	maxGuardReturns: 2, // guard returns still considered "single return" path
	hookOrchestratorMinChildren: 2, // named child Blockiyas to qualify as orchestrator

	sectionComments: SRP_CONDITIONS.sectionComments,
	conditionalBranches: SRP_CONDITIONS.conditionalBranches,
};

// ---------------------------------------------------------------------------
// Regex constants
// ---------------------------------------------------------------------------

const REACT_HOOK_CALL_RE = /\b(?:React\.)?use[A-Z]\w*\s*\(/;

/** Matches useEffect( specifically */
const USE_EFFECT_RE = /\b(?:React\.)?useEffect\s*\(/g;

/** Matches useState( specifically */
const USE_STATE_RE = /\b(?:React\.)?useState\s*\(/g;

/** Matches any context hook: useXxxContext, useXxxStore, useXxxState */
const CONTEXT_HOOK_RE = /\b(?:React\.)?use([A-Z]\w*(?:Context|Store|State))\s*\(/g;

const JSX_BLOCK_COMMENT_RE = /\{\s*\/\*[\s\S]*?\*\/\s*\}/g;

/**
 * Section markers — broadened from v1.
 * Now catches:
 *   - Structural labels: Right Column:, Left Panel, Footer, etc.
 *   - Freeform labels: {/* User Info *\/}, {/* Actions *\/}, {/* Empty State *\/}
 *   - Line comments: // Section:, // REGION:, // --- Header ---
 */
const JSX_SECTION_MARKER_RE =
	/(?:(?:Left|Right|Top|Bottom)\s+(?:Column|Panel|Sidebar|Section)|(?:Section|Column|Panel|Sidebar|Header|Footer|Toolbar|Actions|Metadata|Empty\s*State|User\s*Info|Controls|Stats|Details)\s*:?)/i;

const SECTION_LINE_COMMENT_RE = /\/\/\s*(?:Section|REGION|Column|Panel|---\s*\w|Header|Footer|Actions|Controls)\s*:?/i;

const IF_CONDITION_RE = /<If\s+condition=\{([^}]+)\}/g;

/** Guard clauses and early alternate-UI returns */
const GUARD_RETURN_RE = /^\s*if\s*\([^)]+\)\s*return\s+(?:null|undefined|<\/>|false|[<(])/;

/** State-machine branches share one reactive scope */
const STATE_MACHINE_IF_RE =
	/\b(?:displayState|detailViewState|pageState|loadState|paletteCompleteness|search\.state|status\.type|boardState|skeleton)\b/;

/** Status overlays on one entity share reactive scope */
const STATUS_OVERLAY_IF_RE = /\b(?:is[A-Z]\w+|pending\w*|callQueue|\w+Errors|isRateLimited)\b/;

/** Layout / visibility toggles — not independent reactive regions */
const LAYOUT_TOGGLE_IF_RE =
	/\b(?:isCollapsed|isExpanded|isSectionExpanded|isStale|isSearching|hasQuery|hasResults|isAtArtifactLimit|totalPages|activeCount|msg\.|sublabel|resultCount)\b/;

/**
 * Token-based JSX prop lines — lines that are ONLY a design-token prop value.
 * e.g.  fontSize={fontSize.xs}
 *       color={color.textTertiary}
 *       mr={space.sm}
 *       gap={0}
 * These inflate LOC without adding logic complexity.
 */
const TOKEN_PROP_LINE_RE =
	/^\s*(?:fontSize|color|fontFamily|fontWeight|lineHeight|letterSpacing|mr|ml|mt|mb|mx|my|p|px|py|pt|pb|pl|pr|gap|space|width|height|minWidth|maxWidth|minHeight|maxHeight|flex(?:Shrink|Grow|Basis)?|overflow(?:X|Y)?|textOverflow|whiteSpace|textAlign|alignItems|justifyContent|alignSelf|display|position|top|left|right|bottom|zIndex|borderRadius|border(?:Width|Color|Style)?|opacity|cursor|transition|transform|background(?:Color)?|boxShadow|outline|visibility|pointerEvents|userSelect|listStyle|textDecoration|verticalAlign|wordBreak|as|type|sideOffset|align)=\{[^}]+\}\s*$/;

/**
 * Nested ternary: a ternary whose consequent or alternate itself contains a ternary.
 * We detect this by counting lines that contain `?` and checking for depth.
 */
const TERNARY_LINE_RE = /\?(?!\s*\.)/; // ? not followed by . (optional chaining)
const TERNARY_NESTED_RE = /\?[^:]*\?/; // two ? before first standalone :

/**
 * Nested component definition inside a function body.
 * e.g.  function Inner(  or  const Inner = (  or  const Inner: React.FC
 */
const NESTED_COMPONENT_RE =
	/^\s*(?:function\s+[A-Z][A-Za-z0-9]*\s*\(|const\s+[A-Z][A-Za-z0-9]*\s*(?::\s*React\.(?:FC|ComponentType|ReactNode)\s*)?=\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*:\s*\w+\s*=>))/;

/** UI primitives — orchestrators compose named child Blockiyas, not these */
const JSX_UI_PRIMITIVES = new Set([
	"Box",
	"Flex",
	"Text",
	"Button",
	"Icon",
	"Input",
	"If",
	"For",
	"Maybe",
	"Repeat",
	"ScrollArea",
	"ScrollAreaViewport",
	"ScrollAreaScrollbar",
	"ScrollAreaThumb",
	"Spinner",
	"FeedbackTier",
	"Tooltip",
	"TooltipTrigger",
	"TooltipContent",
	"TooltipProvider",
	"React",
]);

const EXCLUDED_PATH_SEGMENTS = [
	"node_modules/",
	"packages/primitives/",
	"packages/toolkit/",
	"packages/shell/",
	"__tests__/",
];

/** App workbench glue — large by nature; not Blockiya SRP targets. */
const APPS_PATH_RE = /(^|\/)apps\//;

// ---------------------------------------------------------------------------
// File-level guards
// ---------------------------------------------------------------------------

function shouldSkipFile(filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	if (EXCLUDED_PATH_SEGMENTS.some(seg => normalised.includes(seg))) return true;
	if (APPS_PATH_RE.test(normalised)) return true;
	if (/\.(test|spec)\.[jt]sx?$/.test(normalised)) return true;
	if (/\.stories\.(tsx?|jsx?)$/.test(normalised)) return true;
	return false;
}

function isBarrelFile(lines) {
	const nonEmpty = lines.map(l => l.trim()).filter(Boolean);
	if (nonEmpty.length === 0) return true;
	return nonEmpty.every(
		l =>
			l.startsWith("export ") ||
			l.startsWith("import ") ||
			l.startsWith("//") ||
			l.startsWith("/*") ||
			l.startsWith("*") ||
			l.endsWith("*/")
	);
}

// ---------------------------------------------------------------------------
// Token-inflation LOC adjustment (v2)
// ---------------------------------------------------------------------------

/**
 * Count lines that are purely design-token props.
 * These inflate LOC in token-based codebases without adding logic complexity.
 */
export function countTokenPropLines(bodyLines) {
	return bodyLines.filter(l => TOKEN_PROP_LINE_RE.test(l)).length;
}

/**
 * Return an effective LOC that discounts token-prop inflation.
 * Only applies deflation when token props make up a significant fraction
 * of the body (CONFIG.tokenPropRatio), so non-token-heavy components
 * are unaffected.
 */
export function effectiveLoc(bodyLines, rawLoc) {
	const tokenLines = countTokenPropLines(bodyLines);
	const ratio = tokenLines / rawLoc;
	if (ratio >= CONFIG.tokenPropRatio) {
		return Math.round(rawLoc * CONFIG.tokenDeflationFactor);
	}
	return rawLoc;
}

// ---------------------------------------------------------------------------
// Hook analysis (v2)
// ---------------------------------------------------------------------------

export function bodyUsesReactHooks(bodyLines) {
	return bodyLines.some(line => REACT_HOOK_CALL_RE.test(line));
}

/** Count useEffect calls — each is an independent side-effect scope */
export function countEffectCalls(bodyLines) {
	const joined = bodyLines.join("\n");
	return (joined.match(USE_EFFECT_RE) || []).length;
}

/** Count useState calls — each atom is an independent reactive dependency */
export function countStateAtoms(bodyLines) {
	const joined = bodyLines.join("\n");
	return (joined.match(USE_STATE_RE) || []).length;
}

/**
 * Count distinct context hooks consumed.
 * useAuthContext, useEditorContext, useNotificationContext → 3 scopes.
 */
export function countContextHooks(bodyLines) {
	const joined = bodyLines.join("\n");
	const names = new Set();
	for (const match of joined.matchAll(CONTEXT_HOOK_RE)) {
		names.add(match[1]); // capture group 1 = hook name without "use"
	}
	return names.size;
}

// ---------------------------------------------------------------------------
// Nested ternary detection (v2)
// ---------------------------------------------------------------------------

/**
 * Count ternary expressions that are nested (contain another ternary
 * in their branch). These are hidden conditional branches invisible to
 * the <If condition={}> extractor.
 */
export function countNestedTernaries(bodyLines) {
	let count = 0;
	for (const line of bodyLines) {
		if (TERNARY_NESTED_RE.test(line)) count++;
	}
	return count;
}

// ---------------------------------------------------------------------------
// Nested component definition detection (v2)
// ---------------------------------------------------------------------------

/**
 * Detect component definitions nested inside a parent component body.
 * This is a concrete anti-pattern (causes remounting) and an SRP signal.
 *
 * Skips:
 *  - The first non-blank line (the component's own definition)
 *  - Lowercase function helpers (formatName, handleClick, etc.)
 */
export function hasNestedComponentDefinition(bodyLines) {
	// Find the index of the first non-blank line — that is the component's own definition
	let ownDefIndex = -1;
	for (let i = 0; i < bodyLines.length; i++) {
		if (bodyLines[i].trim().length > 0) {
			ownDefIndex = i;
			break;
		}
	}

	for (let i = 0; i < bodyLines.length; i++) {
		if (i === ownDefIndex) continue; // skip the component's own definition line
		const line = bodyLines[i];
		if (!NESTED_COMPONENT_RE.test(line)) continue;
		// Extra guard: must be a capitalized name (already in regex) AND not a type alias
		// Confirm it's not a TypeScript type/interface line
		const trimmed = line.trim();
		if (trimmed.startsWith("type ") || trimmed.startsWith("interface ")) continue;
		return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Prop count detection (v2)
// ---------------------------------------------------------------------------

/**
 * Estimate the number of props a component accepts by examining its
 * first line (or first few lines for multi-line destructuring).
 * Works for:
 *   function Foo({ a, b, c }: Props)
 *   const Foo = ({ a, b, c }) =>
 *   const Foo: FC<Props> = ({ a, b, c }) =>
 */
export function estimatePropCount(bodyLines) {
	// Join enough lines to capture multi-line destructured signatures
	const sig = bodyLines.slice(0, 20).join(" ");

	// Find the opening ({ to locate the props destructuring block
	const openIdx = sig.indexOf("({");
	if (openIdx === -1) return 0;

	// Walk forward tracking brace/bracket/paren depth to find the matching }
	// This correctly handles default values like { a = {}, b = [] }
	let depth = 0;
	let start = -1;
	let end = -1;
	for (let i = openIdx + 1; i < sig.length; i++) {
		const ch = sig[i];
		if (ch === "{" || ch === "[" || ch === "(") {
			if (depth === 0) start = i;
			depth++;
		} else if (ch === "}" || ch === "]" || ch === ")") {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}

	if (start === -1 || end === -1) return 0;
	const propList = sig.slice(start + 1, end);
	if (propList.trim().length === 0) return 0;

	// Strip trailing comma before counting (common in multi-line TS destructuring)
	const trimmedList = propList.trimEnd().replace(/,\s*$/, "");
	if (trimmedList.trim().length === 0) return 0;

	// Count top-level commas only (ignoring commas inside default value expressions)
	let count = 1;
	let d = 0;
	for (const ch of trimmedList) {
		if (ch === "{" || ch === "[" || ch === "(") d++;
		else if (ch === "}" || ch === "]" || ch === ")") d--;
		else if (ch === "," && d === 0) count++;
	}
	return count;
}

// ---------------------------------------------------------------------------
// Import domain diversity (v2)
// ---------------------------------------------------------------------------

/**
 * Count distinct first-level import path domains from the full file source.
 * e.g. imports from "auth/...", "editor/...", "charts/...", "notifications/..."
 * → 4 distinct domains.
 * Only relative imports are considered (external packages don't signal domain coupling).
 */
export function countImportDomains(sourceLines) {
	const domains = new Set();
	for (const line of sourceLines) {
		const match = line.match(/^\s*import\s+.*from\s+['"](\.[./]*[^'"]+)['"]/);
		if (!match) continue;
		const path = match[1];
		// Take first meaningful path segment after relative prefix
		const segments = path.replace(/^[./]+/, "").split("/");
		if (segments[0]) domains.add(segments[0]);
	}
	return domains.size;
}

// ---------------------------------------------------------------------------
// Section markers (broadened in v2)
// ---------------------------------------------------------------------------

export function countSectionMarkers(bodyLines) {
	const markers = new Set();
	for (const line of bodyLines) {
		if (SECTION_LINE_COMMENT_RE.test(line)) {
			markers.add(line.trim());
			continue;
		}
		const jsxComments = line.match(JSX_BLOCK_COMMENT_RE) || [];
		for (const block of jsxComments) {
			const inner = block.replace(/^\{\s*\/\*\s*|\s*\*\/\s*\}$/g, "").trim();
			if (inner.length < 3) continue;
			if (JSX_SECTION_MARKER_RE.test(inner)) {
				markers.add(inner);
			}
		}
	}
	return markers.size;
}

// ---------------------------------------------------------------------------
// Branch analysis (carried over from v1, unchanged)
// ---------------------------------------------------------------------------

function extractIfConditions(bodyLines) {
	const conditions = [];
	for (const line of bodyLines) {
		if (GUARD_RETURN_RE.test(line.trim())) continue;
		for (const match of line.matchAll(IF_CONDITION_RE)) {
			conditions.push(match[1].trim());
		}
	}
	return conditions;
}

export function countSignificantIfBranches(bodyLines) {
	const conditions = extractIfConditions(bodyLines);
	if (conditions.length === 0) return 0;

	const scopes = new Set();
	for (const cond of conditions) {
		if (STATE_MACHINE_IF_RE.test(cond)) continue;
		if (LAYOUT_TOGGLE_IF_RE.test(cond)) continue;

		const collectionMatch = cond.match(/\b(extensions|items|artifacts|results|artifact|palette|draft)\b/);
		if (collectionMatch) {
			scopes.add(collectionMatch[1]);
			continue;
		}
		if (STATUS_OVERLAY_IF_RE.test(cond)) {
			scopes.add("__status__");
			continue;
		}

		scopes.add(cond);
	}

	return scopes.size;
}

// ---------------------------------------------------------------------------
// Return path analysis
// ---------------------------------------------------------------------------

function countReturnStatements(bodyLines) {
	let count = 0;
	for (const line of bodyLines) {
		const trimmed = line.trim();
		if (GUARD_RETURN_RE.test(trimmed)) continue;
		if (/\breturn\s+[<(]/.test(trimmed) || /\breturn\s*\(/.test(trimmed)) {
			count++;
		}
	}
	return count;
}

function isCohesiveSingleReturn(bodyLines) {
	const returns = countReturnStatements(bodyLines);
	const guards = bodyLines.filter(l => GUARD_RETURN_RE.test(l.trim())).length;
	return returns <= 1 && guards <= CONFIG.maxGuardReturns;
}

// ---------------------------------------------------------------------------
// JSX shape analysis
// ---------------------------------------------------------------------------

function countJsxLines(bodyLines) {
	return bodyLines.filter(l => /<\/?[A-Za-z]/.test(l) || /<>|<\/>/.test(l)).length;
}

function isMostlyJsxMapping(bodyLines) {
	const nonComment = bodyLines.filter(l => {
		const t = l.trim();
		return t && !t.startsWith("//") && !t.startsWith("/*") && !t.startsWith("*");
	});
	if (nonComment.length < CONFIG.minLinesForJsxRatio) return false;
	const jsxLines = countJsxLines(bodyLines);
	return jsxLines / nonComment.length >= CONFIG.jsxRatioForLayout;
}

function countNamedChildRenders(bodyLines) {
	let count = 0;
	for (const line of bodyLines) {
		for (const match of line.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
			if (!JSX_UI_PRIMITIVES.has(match[1])) count++;
		}
	}
	return count;
}

// ---------------------------------------------------------------------------
// Signal scoring
// ---------------------------------------------------------------------------

/**
 * Split-relevant signals only — used to gate LOC violations (not size/density alone).
 * Requires ≥2 among: independent <If> scopes, section markers + branches, hook-heavy LOC.
 */
export function countSplitRelevantSignals(bodyLines, loc) {
	let score = 0;
	const w = CONFIG.signals;

	const ifBranches = countSignificantIfBranches(bodyLines);
	const sectionMarkers = countSectionMarkers(bodyLines);

	if (ifBranches >= CONFIG.minIfBranches) score += w.ifBranches;
	if (sectionMarkers >= CONFIG.minSectionMarkers && ifBranches >= CONFIG.minIfBranches) {
		score += w.sectionMarkersWithBranches;
	}
	if (bodyUsesReactHooks(bodyLines) && loc >= CONFIG.locHookHeavy) {
		score += w.hookHeavyLoc;
	}

	return score;
}

/**
 * Full signal score (split-relevant + density hints for messages / future toggles).
 */
export function countSrpSignals(bodyLines, loc, extraSignals = {}) {
	let score = 0;
	const w = CONFIG.signals;

	const ifBranches = countSignificantIfBranches(bodyLines);
	const sectionMarkers = countSectionMarkers(bodyLines);

	if (ifBranches >= CONFIG.minIfBranches) score += w.ifBranches;
	if (sectionMarkers >= CONFIG.minSectionMarkers && ifBranches >= CONFIG.minIfBranches) {
		score += w.sectionMarkersWithBranches;
	}
	if (bodyUsesReactHooks(bodyLines) && loc >= CONFIG.locHookHeavy) {
		score += w.hookHeavyLoc;
	}

	// v2 signals
	if (countEffectCalls(bodyLines) >= CONFIG.minEffectCalls) {
		score += w.multipleEffects;
	}
	if (countStateAtoms(bodyLines) >= CONFIG.minStateAtoms) {
		score += w.multipleStateAtoms;
	}
	if (countContextHooks(bodyLines) >= CONFIG.minContextHooks) {
		score += w.contextDiversity;
	}
	if (countNestedTernaries(bodyLines) >= CONFIG.minNestedTernaryCount) {
		score += w.nestedTernaries;
	}
	if (extraSignals.propCount >= CONFIG.propCountThreshold) {
		score += w.highPropCount;
	}
	if (extraSignals.importDomains >= CONFIG.importDomainThreshold) {
		score += w.importDomainDiversity;
	}

	return score;
}

// ---------------------------------------------------------------------------
// Suppression logic (v2)
// ---------------------------------------------------------------------------

function isCohesivePresentational(bodyLines) {
	return !bodyUsesReactHooks(bodyLines) && isCohesiveSingleReturn(bodyLines);
}

function isPresentationalLayout(bodyLines) {
	return !bodyUsesReactHooks(bodyLines);
}

function isHookOrchestrator(bodyLines) {
	if (!bodyUsesReactHooks(bodyLines)) return false;
	if (!isCohesiveSingleReturn(bodyLines)) return false;
	if (countSignificantIfBranches(bodyLines) >= CONFIG.minIfBranches) return false;
	return countNamedChildRenders(bodyLines) >= CONFIG.hookOrchestratorMinChildren;
}

/** Labeled layout regions (section comments) without independent <If> scopes. */
function isSectionLabeledLayout(bodyLines) {
	const sections = countSectionMarkers(bodyLines);
	if (sections < CONFIG.minSectionMarkers) return false;
	return countSignificantIfBranches(bodyLines) < CONFIG.minIfBranches;
}

export function shouldSuppressLocFalsePositive(component, extraSignals = {}) {
	const { bodyLines, loc } = component;

	if (isCohesivePresentational(bodyLines) && loc > CONFIG.locPresentationalCeiling) {
		return false;
	}

	if (isCohesivePresentational(bodyLines)) return true;
	if (isPresentationalLayout(bodyLines) && isMostlyJsxMapping(bodyLines)) return true;
	if (isHookOrchestrator(bodyLines)) return true;
	if (isSectionLabeledLayout(bodyLines)) return true;

	if (hasNestedComponentDefinition(bodyLines)) return false;

	// LOC-only path: do not flag on density hints (effects, ternaries, props, imports).
	if (countSplitRelevantSignals(bodyLines, loc) < CONFIG.minSignalScore) return true;

	if (
		bodyUsesReactHooks(bodyLines) &&
		isCohesiveSingleReturn(bodyLines) &&
		countSignificantIfBranches(bodyLines) < CONFIG.minIfBranches
	) {
		return true;
	}

	return false;
}

// ---------------------------------------------------------------------------
// Ignore helpers
// ---------------------------------------------------------------------------

function isLineIgnored(lineNum, ignored) {
	return ignored.has(lineNum);
}

function isComponentIgnored(startLine, endLine, ignored) {
	if (isLineIgnored(startLine, ignored)) return true;
	for (let ln = startLine; ln <= endLine; ln++) {
		if (ignored.has(ln)) return true;
	}
	return false;
}

function isTrivialWrapper(bodyLines, loc) {
	if (loc > 40) return false;
	const ifCount = countSignificantIfBranches(bodyLines);
	return ifCount === 0 && !bodyUsesReactHooks(bodyLines);
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

function buildLocMessage(name, loc, effectiveLoc, startLine, endLine, hints = []) {
	const range = `L${startLine}–${endLine}`;
	const locNote =
		effectiveLoc < loc ? `${loc} LOC raw / ~${effectiveLoc} effective after token-prop deflation` : `${loc} LOC`;
	let msg =
		`${name} (${locNote}, ${range}): review for independent state scopes, ` +
		`frequently-updating subtrees, expensive render branches, or reusable sections ` +
		`— split only if it reduces shared reactive dependencies (react-srp.md decision checklist).`;
	if (hints.length > 0) {
		msg += ` Hints: ${hints.join("; ")}.`;
	}
	return msg;
}

function buildLocFix(name, loc) {
	return `${name} (${loc} LOC): consider extracting branches into separate components IF they depend on different reactive state — see react-srp.md`;
}

// ---------------------------------------------------------------------------
// The three checks
// ---------------------------------------------------------------------------

function checkLocThreshold(components, ignored, sourceLines) {
	const { enabled, maxLines } = SRP_CONDITIONS.locThreshold;
	if (!enabled) return [];

	const importDomains = countImportDomains(sourceLines);
	const violations = [];

	for (const comp of components) {
		if (comp.loc <= maxLines) continue;
		if (isComponentIgnored(comp.startLine, comp.endLine, ignored)) continue;

		const effLoc = effectiveLoc(comp.bodyLines, comp.loc);

		if (effLoc <= maxLines) continue;

		const propCount = estimatePropCount(comp.bodyLines);
		const extraSignals = { propCount, importDomains };

		if (shouldSuppressLocFalsePositive(comp, extraSignals)) continue;

		const hints = [];
		const ifBranches = countSignificantIfBranches(comp.bodyLines);
		const effects = countEffectCalls(comp.bodyLines);
		const atoms = countStateAtoms(comp.bodyLines);
		const contexts = countContextHooks(comp.bodyLines);
		const nestedTern = countNestedTernaries(comp.bodyLines);
		const nestedComp = hasNestedComponentDefinition(comp.bodyLines);

		if (ifBranches >= CONFIG.minIfBranches) {
			hints.push(`${ifBranches} independent <If> scopes may represent separate UI regions`);
		}
		if (countSectionMarkers(comp.bodyLines) >= CONFIG.minSectionMarkers) {
			hints.push("section comments suggest distinct sub-concerns");
		}
		if (effects >= CONFIG.minEffectCalls) {
			hints.push(`${effects} useEffect calls suggest independent side-effect scopes`);
		}
		if (atoms >= CONFIG.minStateAtoms) {
			hints.push(`${atoms} useState atoms suggest multiple independent reactive dependencies`);
		}
		if (contexts >= CONFIG.minContextHooks) {
			hints.push(`consuming ${contexts} different context hooks — multiple reactive scopes`);
		}
		if (nestedTern >= CONFIG.minNestedTernaryCount) {
			hints.push(`${nestedTern} nested ternaries are hidden conditional branches`);
		}
		if (nestedComp) {
			hints.push("nested component definition found — causes remounting on parent re-render");
		}
		if (propCount >= CONFIG.propCountThreshold) {
			hints.push(`${propCount} props signals too many caller concerns`);
		}
		if (importDomains >= CONFIG.importDomainThreshold) {
			hints.push(`file imports from ${importDomains} distinct domains — possible concern mixing`);
		}
		if (bodyUsesReactHooks(comp.bodyLines)) {
			hints.push("uses React hooks — verify state scopes before splitting");
		}

		violations.push({
			file: null,
			line: comp.startLine,
			text: comp.bodyLines[0]?.trim() ?? "",
			message: buildLocMessage(comp.name, comp.loc, effLoc, comp.startLine, comp.endLine, hints),
			fix: buildLocFix(comp.name, comp.loc),
		});
	}
	return violations;
}

function checkSectionComments(components, ignored, filePath) {
	const { enabled, minSections } = CONFIG.sectionComments;
	if (!enabled) return [];

	const violations = [];
	for (const comp of components) {
		if (isComponentIgnored(comp.startLine, comp.endLine, ignored)) continue;
		if (isTrivialWrapper(comp.bodyLines, comp.loc)) continue;
		if (filePath.includes(".stories.")) continue;

		const sectionCount = countSectionMarkers(comp.bodyLines);
		if (sectionCount < minSections) continue;

		violations.push({
			file: null,
			line: comp.startLine,
			text: comp.bodyLines[0]?.trim() ?? "",
			message:
				`${comp.name}: ${sectionCount} section comment(s) (L${comp.startLine}–${comp.endLine}) ` +
				`suggest distinct UI sub-concerns — review whether they share reactive state before splitting (react-srp.md).`,
			fix: `Extract labeled regions into child components only if they depend on different state — see react-srp.md`,
		});
	}
	return violations;
}

function checkConditionalBranches(components, ignored) {
	const { enabled, minBranches } = CONFIG.conditionalBranches;
	if (!enabled) return [];

	const violations = [];
	for (const comp of components) {
		if (isComponentIgnored(comp.startLine, comp.endLine, ignored)) continue;

		const branchCount = countSignificantIfBranches(comp.bodyLines);
		if (branchCount < minBranches) continue;

		const sectionCount = countSectionMarkers(comp.bodyLines);
		const locHot = comp.loc > SRP_CONDITIONS.locThreshold.maxLines;
		if (!locHot && sectionCount < CONFIG.sectionComments.minSections) continue;

		violations.push({
			file: null,
			line: comp.startLine,
			text: comp.bodyLines[0]?.trim() ?? "",
			message:
				`${comp.name}: ${branchCount} <If condition=…> branch(es) (L${comp.startLine}–${comp.endLine}) ` +
				`— consider extracting IF branches use different reactive state (react-srp.md).`,
			fix: `Extract branches with different reactive state into separate components — see react-srp.md`,
		});
	}
	return violations;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function checkReactSrp(source, filePath) {
	if (shouldSkipFile(filePath)) return [];

	const lines = source.split("\n");
	if (isBarrelFile(lines)) return [];

	const ignored = buildIgnoredLines(lines);
	const components = detectComponents(lines);

	const violations = [
		...checkLocThreshold(components, ignored, lines),
		...checkSectionComments(components, ignored, filePath),
		...checkConditionalBranches(components, ignored),
	];

	return violations.map(v => ({ ...v, file: filePath }));
}

// ---------------------------------------------------------------------------
// Exports for tests and external analysis
// ---------------------------------------------------------------------------

/** Current toggle state — for tests */
export function getSrpConditions() {
	return SRP_CONDITIONS;
}

/**
 * Full signal analysis for a component body — used by tests and CLI debug output.
 * Accepts optional extraSignals for prop count and import domain diversity.
 */
export function analyzeSrpSignals(bodyLines, loc, extraSignals = {}) {
	const conditions = extractIfConditions(bodyLines);
	const scopeDetails = [];
	const scopes = new Set();

	for (const cond of conditions) {
		if (STATE_MACHINE_IF_RE.test(cond)) {
			scopeDetails.push({ cond, scope: null, reason: "state-machine" });
			continue;
		}
		if (LAYOUT_TOGGLE_IF_RE.test(cond)) {
			scopeDetails.push({ cond, scope: null, reason: "layout-toggle" });
			continue;
		}
		const collectionMatch = cond.match(/\b(extensions|items|artifacts|results|artifact|palette|draft)\b/);
		if (collectionMatch) {
			scopes.add(collectionMatch[1]);
			scopeDetails.push({ cond, scope: collectionMatch[1], reason: "collection" });
			continue;
		}
		if (STATUS_OVERLAY_IF_RE.test(cond)) {
			scopes.add("__status__");
			scopeDetails.push({ cond, scope: "__status__", reason: "status-overlay" });
			continue;
		}
		scopes.add(cond);
		scopeDetails.push({ cond, scope: cond, reason: "unique" });
	}

	const effLoc = effectiveLoc(bodyLines, loc);

	return {
		rawLoc: loc,
		effectiveLoc: effLoc,
		tokenPropLines: countTokenPropLines(bodyLines),
		ifBranches: scopes.size,
		sectionMarkers: countSectionMarkers(bodyLines),
		hooks: bodyUsesReactHooks(bodyLines),
		effectCalls: countEffectCalls(bodyLines),
		stateAtoms: countStateAtoms(bodyLines),
		contextHooks: countContextHooks(bodyLines),
		nestedTernaries: countNestedTernaries(bodyLines),
		hasNestedComponent: hasNestedComponentDefinition(bodyLines),
		propCount: extraSignals.propCount ?? estimatePropCount(bodyLines),
		importDomains: extraSignals.importDomains ?? 0,
		splitScore: countSplitRelevantSignals(bodyLines, effLoc),
		score: countSrpSignals(bodyLines, effLoc, extraSignals),
		suppressed: shouldSuppressLocFalsePositive({ bodyLines, loc: effLoc }, extraSignals),
		scopeDetails,
	};
}

// ---------------------------------------------------------------------------
// CLI runner
// ---------------------------------------------------------------------------

runCheckCli(import.meta.url, checkReactSrp, {
	step: 37,
	name: "check-react-srp",
	extensions: [".tsx", ".jsx", ".ts", ".js"],
	filter: filePath => {
		const n = filePath.replace(/\\/g, "/");
		if (shouldSkipFile(n)) return false;
		if (APPS_PATH_RE.test(n)) return false;
		return n.startsWith("capabilities/");
	},
});
