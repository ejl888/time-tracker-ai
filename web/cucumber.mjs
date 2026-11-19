// Runs the shared Gherkin specs at the repo root against the web app's domain code.
export default {
  paths: ['../specs/**/*.feature'],
  // Node runs these TypeScript files directly by stripping the types.
  import: ['features/**/*.ts'],
  // Scenarios without step definitions report as undefined or pending instead of failing the build.
  strict: false,
  format: ['summary'],
}
