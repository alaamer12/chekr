/** @type {import('checkr').CheckrConfig} */
export default {
  checksDir: "./.checkr/checks",
  include: ["**/*.js"],
  gitignore: ".gitignore",
  scanPath: ".",
  bail: false,
  cache: false,
  reporter: "json",
  steps: [
    {
      id: "always_pass",
      step: 1,
      enabled: true,
    },
    {
      id: "todo_violation",
      step: 2,
      enabled: true,
      include: ["src/**/*.js"],
    },
  ],
};
