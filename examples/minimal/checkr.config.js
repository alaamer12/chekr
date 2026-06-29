/** @type {import('checkr').CheckrConfig} */
export default {
  checksDir: "./.checkr/checks",
  include: ["**/*.js"],
  gitignore: ".gitignore",
  scanPath: ".",
  bail: false,
  cache: false,
  reporter: "default",
};
