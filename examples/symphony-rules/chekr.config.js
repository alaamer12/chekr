/** @type {import('chekr').ChekrConfig} */
export default {
  checksDir: "./.chekr/checks",
  include: ["**/*.{ts,tsx}"],
  gitignore: ".gitignore",
  bail: false,
  cache: false,
  reporter: "default",
  steps: [
    { id: "check_literal_unions", step: 1, enabled: false },
    { id: "check_duplicate_interfaces", step: 2, enabled: false },
    { id: "check_react_srp", step: 3, enabled: false },
  ],
};
