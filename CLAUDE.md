# Timetracker

A time tracking app: first a React web app, later a Spring Boot backend and a mobile app that stay in sync.
See [docs/roadmap.md](docs/roadmap.md) for phases and design decisions.

## How we work

- **Ask before acting.** Propose a plan and wait for approval before changing files or running commands that change state.
- **Explain each step.** The owner is learning how Claude Code works: say briefly what you do and why.
- **One branch per feature.** Never commit directly to `main`. Every feature gets a branch (`feature/<short-name>`) and a pull request on GitHub.
- **Conventional Commits.** Format: `<type>(<optional scope>): <summary>`.
  Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`.
  Scopes: `web`, `backend`, `mobile`. Use `!` or a `BREAKING CHANGE:` footer for breaking changes.
- **Every commit is green.** Each commit must build and pass all tests on its own, not just the branch tip.
  Before opening a PR, verify every commit with the rebase command under [Commands](#commands).
- **Rebase merge, no squash.** Every commit lands on `main` as-is, so each must be meaningful.
  Clean up branch history (fold WIP and fixup commits) before merging.
- **Small vertical slices.** Each feature is usable end to end (UI + storage + tests) before starting the next.
- **No AI features in the app itself.**

## Spec-driven development (BDD / TDD)

Every story follows these steps; the owner approves steps 2 and 3 before code is written.

1. **Story:** pick a user story from [docs/requirements.md](docs/requirements.md) (e.g. US-08).
2. **Spec:** write Given/When/Then scenarios in `specs/*.feature`, referencing the story ID.
   Commit them first as `test(spec): …`; scenarios without step definitions report as
   "not implemented yet" and do not fail the build; failed or ambiguous steps do.
3. **Plan:** propose the technical design and task list (plan mode).
4. **TDD per scenario:** failing test → make it pass → refactor, then commit test and code together.
5. **Review and PR.**

Rules:

- **Specs are the source of truth.** Code changes never modify `specs/` or existing tests to make them pass.
  If a spec or test seems wrong, stop and ask the owner.
- **Domain rules** (billed hours, balance, overlaps) are executable Gherkin, run with Cucumber.js now and Cucumber-JVM
  in the backend later, so web and backend share the same specs.
- **UI details** (e.g. autocomplete) are tested with plain Vitest + React Testing Library.
- `specs/` lives at the repo root, not inside an app, because all apps share it.

## Stack

- **Web (phase 1):** React 19 + TypeScript (Vite), browser localStorage; Vitest + React Testing Library,
  Cucumber.js, oxlint, Prettier. Node version in `web/.nvmrc`.
- **Backend (phase 2+):** Java, Spring Boot

## Commands

Run in `web/`, after `nvm use` and `npm install`:

| Command | What |
|---|---|
| `npm run check` | Lint, format check, type check, build, tests and specs; must pass for every commit |
| `npm test` | Vitest in watch mode |
| `npm run test:specs` | Shared Gherkin specs; scenarios with undefined steps are listed, not failed |
| `npx cucumber-js` | Specs with snippets for undefined steps |
| `npm run format` | Format with Prettier |
| `npm run dev` | Dev server |

Verify every commit of a branch before opening a PR (from the repo root; commits without `web/package.json` are skipped):

```sh
git rebase --exec '[ ! -f web/package.json ] || (cd web && npm ci && npm run check)' main
```

CI (GitHub Actions, `.github/workflows/check.yml`) runs `npm ci` and `npm run check` on every pull request and push to
`main`.

## Design rules (keep sync possible)

- Components never call `localStorage` directly; all data access goes through a repository interface.
- IDs are UUIDs generated on the client.
- Every record has `createdAt`, `updatedAt` and `deleted` (soft delete).
- Moments are stored in UTC (ISO 8601). Time entries also store the IANA time zone they were entered in and are
  shown in that zone. Durations are whole minutes. See [docs/data-model.md](docs/data-model.md).
- The data model in `docs/` is the contract; update it in the same PR as any model change.
