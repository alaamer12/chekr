/**
 * Shared constants used across multiple check and fix scripts.
 * Define once, import everywhere to avoid duplication.
 */

export const RAW_HTML_ELEMENTS = [
	"div",
	"span",
	"p",
	"section",
	"article",
	"main",
	"aside",
	"header",
	"footer",
	"nav",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"button",
	"input",
	"textarea",
	"select",
	"option",
	"form",
	"label",
	"fieldset",
	"ul",
	"ol",
	"li",
	"dl",
	"dt",
	"dd",
	"a",
	"img",
	"video",
	"audio",
	"canvas",
	"svg",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
	"pre",
	"code",
	"blockquote",
	"hr",
	"br",
];

export const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	".turbo",
	"dist",
	"build",
	"coverage",
	".cache",
	"__pycache__",
	".parcel-cache",
	"storybook-static",
	".vite",
	".vite-temp",
	"__tests__",
	".next",
]);

export const IGNORED_PATHS = new Set([
	"packages/ui",
]);

/**
 * Infrastructure directories that should be ignored by architectural checks.
 * These contain documentation, steering rules, or toolkit code itself.
 */
export const INFRASTRUCTURE_DIRS = [
	"packages/toolkit",
	".kiro",
	".repertoire",
	".agent",
	".github",
	".vscode",
	".idea",
	".storybook",
	"__mocks__",
	"__stubs__",
];

export const VALID_STORYBOOK_CATEGORIES = [
	"Primitives",
	"Patterns",
	"Adapters",
	"Shell",
	"Panels",
	"Overlays",
	"Pages",
];

export const PRIMITIVES_ALLOWED_PATHS = ["packages/primitives/base", "packages/primitives/compound"];
