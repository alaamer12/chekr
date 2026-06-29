/** @type {import('chekr').ChekrConfig} */
export default {
  checksDir: "./.chekr/checks",
  include: ["**/*.js"],
  gitignore: ".gitignore",
  scanPath: ".",
  bail: false,
  cache: false,
  reporter: "default",
};
