/** @type {import('chekr').ChekrConfig} */
export default {
  checksDir: "./.chekr/checks",
  include: ["**/*.js"],
  gitignore: ".gitignore",
  scanPath: ".",
  bail: false,
  cache: false,
  reporter: "json",
  steps: [
    {
      id: "check_always_pass",
      step: 1,
      enabled: true,
    },
    {
      id: "check_todo_violation",
      step: 2,
      enabled: true,
      include: ["src/**/*.js"],
    },
  ],
};
