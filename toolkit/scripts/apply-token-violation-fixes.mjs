/**
 * Applies automated fixes for palette + theme-color violations from violations.json.
 * Run from repo root: node packages/toolkit/scripts/apply-token-violation-fixes.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPaletteFix } from "../utils/palette-to-semantic-map.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const VIOLATIONS_PATH = join(ROOT, "violations.json");

const PALETTE_ACCESS = /palette\.\w+\[\d+\](?:\.alpha\([^)]*\))?/g;
const THEME_COLOR_PROP =
	/\b((?:color|bg|background|backgroundColor|borderColor|fill|stroke|outlineColor)\s*=\s*)(["'`])([a-z]+)\.(\d+)\2/g;

const SEMANTIC_HINTS = {
	"gray.50": "color.textPrimary",
	"gray.100": "color.textPrimary",
	"gray.200": "color.textPrimary",
	"gray.300": "color.textSecondary",
	"gray.400": "color.textSecondary",
	"gray.500": "color.textTertiary",
	"gray.600": "color.textTertiary",
	"gray.700": "color.border",
	"gray.800": "color.bgElevated",
	"gray.900": "color.bgBase",
	"blue.500": "color.brand",
	"blue.400": "color.brandLight",
	"blue.600": "color.brandDark",
	"red.500": "color.danger",
	"red.600": "color.dangerMuted",
	"red.100": "color.danger",
	"green.500": "color.success",
	"yellow.500": "color.warning",
	"yellow.100": "color.warning",
	"orange.600": "color.syntaxNumber",
	"purple.400": "color.syntaxMacro",
};

function fixPaletteInSource(source) {
	let changed = false;
	const newSource = source.replace(PALETTE_ACCESS, match => {
		const fix = formatPaletteFix(match);
		if (fix.startsWith("color.")) {
			changed = true;
			return fix;
		}
		return match;
	});
	return { source: newSource, changed };
}

function fixThemeColorsInSource(source) {
	let changed = false;
	const newSource = source.replace(THEME_COLOR_PROP, (full, prefix, _q, hue, step) => {
		const token = `${hue}.${step}`;
		const hint = SEMANTIC_HINTS[token];
		if (!hint) return full;
		changed = true;
		const propName = prefix.trim().split("=")[0].trim();
		return `${propName}={${hint}}`;
	});
	return { source: newSource, changed };
}

function ensureColorImport(source) {
	const tokensImport =
		/import\s*\{([^}]*)\}\s*from\s*['"]@symphony\/shared\/tokens['"]/;
	const match = source.match(tokensImport);
	if (!match) return source;

	const parts = match[1]
		.split(",")
		.map(s => s.trim())
		.filter(Boolean);

	const withoutPalette = parts.filter(p => !/^palette\b/.test(p));
	let next = withoutPalette;
	if (!next.some(p => /^color\b/.test(p))) {
		next = ["color", ...next];
	}
	next.sort((a, b) => a.localeCompare(b));

	const replacement = `import { ${next.join(", ")} } from '@symphony/shared/tokens'`;
	return source.replace(tokensImport, replacement);
}

function processFile(filePath) {
	const abs = join(ROOT, filePath);
	let source = readFileSync(abs, "utf8");
	const hadPalette = PALETTE_ACCESS.test(source);
	PALETTE_ACCESS.lastIndex = 0;

	const p = fixPaletteInSource(source);
	source = p.source;
	const t = fixThemeColorsInSource(source);
	source = t.source;

	if (hadPalette || p.changed) {
		source = ensureColorImport(source);
	}

	if (p.changed || t.changed || hadPalette) {
		writeFileSync(abs, source, "utf8");
		return true;
	}
	return false;
}

const report = JSON.parse(readFileSync(VIOLATIONS_PATH, "utf8"));
const files = new Set();
for (const step of ["check-no-palette-usage", "check-theme-color-prop"]) {
	const s = report.steps.find(x => x.name === step);
	for (const v of s?.violations ?? []) files.add(v.file);
}

let fixed = 0;
for (const file of files) {
	if (processFile(file)) {
		fixed++;
		console.log("fixed", file);
	}
}
console.log("done", fixed, "files");
