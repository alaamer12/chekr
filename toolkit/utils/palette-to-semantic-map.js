/**
 * Builds palette.X[Y] → semantic color key map by parsing packages/shared/tokens/color.ts.
 * Used by check-no-palette-usage to suggest replacements.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COLOR_TS_PATH = join(__dirname, "../../shared/tokens/color.ts");

/** @type {Map<string, string[]> | null} */
let cachedMap = null;

/**
 * @returns {Map<string, string[]>} keys like "palette.gray[900]" → ["bgBase", "terminalBg", ...]
 */
export function buildPaletteToSemanticMap() {
	if (cachedMap) return cachedMap;

	const source = readFileSync(COLOR_TS_PATH, "utf8");
	const map = new Map();

	// semanticKey: palette.hue[step] or palette.hue[step].alpha(...)
	const entryRegex = /(\w+)\s*:\s*(palette\.\w+\[\d+\](?:\.alpha\([^)]*\))?)/g;
	let match;
	while ((match = entryRegex.exec(source)) !== null) {
		const semanticKey = match[1];
		const paletteExpr = match[2];
		const baseKey = paletteExpr.replace(/\.alpha\([^)]*\)/, "");
		const lookup = baseKey;
		if (!map.has(lookup)) map.set(lookup, []);
		const list = map.get(lookup);
		if (!list.includes(semanticKey)) list.push(semanticKey);
	}

	cachedMap = map;
	return map;
}

/**
 * @param {string} paletteUsage e.g. "palette.gray[900]" or full line with .alpha()
 * @returns {string | undefined}
 */
export function suggestSemanticForPalette(paletteUsage) {
	const map = buildPaletteToSemanticMap();
	const base = paletteUsage.replace(/\.alpha\([^)]*\).*/, "");
	const matches = map.get(base);
	if (!matches?.length) return undefined;
	return matches[0];
}

/**
 * @param {string} paletteUsage
 * @returns {string}
 */
export function formatPaletteFix(paletteUsage) {
	const semantic = suggestSemanticForPalette(paletteUsage);
	const base = paletteUsage.match(/palette\.\w+\[\d+\]/)?.[0] ?? paletteUsage;
	if (semantic) {
		const alpha = paletteUsage.includes(".alpha(") ? paletteUsage.match(/\.alpha\([^)]*\)/)?.[0] : "";
		return `color.${semantic}${alpha}`;
	}
	return `color.<semanticToken> /* no mapping for ${base} — add to color.ts */`;
}
