# Timetracker web app

React + TypeScript web app, built with Vite. See the [roadmap](../docs/roadmap.md) and [CLAUDE.md](../CLAUDE.md).

## Setup

Requires the Node version in `.nvmrc`:

```sh
nvm use
npm install
```

## Commands

| Command              | What                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`        | Start the dev server                                                               |
| `npm run check`      | Lint, format check, type check, build, tests and specs; must pass for every commit |
| `npm test`           | Run the tests in watch mode                                                        |
| `npm run test:specs` | Run the shared Gherkin specs; undefined scenarios are listed, not failed           |
| `npx cucumber-js`    | Run the specs with snippets for undefined steps                                    |
| `npm run format`     | Format all files with Prettier                                                     |
| `npm run build`      | Type check and build to `dist/`                                                    |
| `npm run preview`    | Serve the build locally                                                            |
