# Timetracker

A time tracking app: first a React web app, later a Spring Boot backend and a mobile app that stay in sync.
See [docs/roadmap.md](docs/roadmap.md) for phases and design decisions.

## How we work

- **Ask before acting.** Propose a plan and wait for approval before changing files or running commands that change state.
- **Ask questions in one go.** When the owner raises a new topic, ask all clarifying questions at once, each with a
  recommendation, instead of one at a time. Questions that only come up later during the work are still fine.
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
- **Park unrelated topics.** When the owner raises a topic that does not affect the current branch, create a GitHub
  issue with the `idea` label (title, context, questions raised so far) and continue the current work.
  Decisions from a parked issue get their own branch and PR, never a commit on an unrelated branch.
- **Pick up parked topics between PRs.** After each merge, list the open `idea` issues so the owner chooses what's next.
- **Fold in review fixes before the PR.** Fold a fix into the commit it corrects before opening the
  PR, instead of adding fix commits at the end.
- **Rework makes a PR a draft.** When an open PR needs changes, make it a draft straight away; mark it ready only after
  the push and green CI.
- **Only the owner merges.** Claude never merges a pull request, not even when CI is green.
- **Scope check before a PR.** List the branch's commits and flag any that don't fit the PR's purpose;
  move those to their own branch before opening the PR.

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
- **UI follows the prototype.** Screens take their layout and look from [docs/prototype/index.html](docs/prototype/index.html).
  The plan (step 3) names which parts of the prototype the story builds; leaving out styling or layout is the
  owner's decision, never an unstated default.
- `specs/` lives at the repo root, not inside an app, because all apps share it.

## Agents

Subagents are defined in `.claude/agents/`. The main session coordinates: it plans with the owner, hands out work,
shows the results and makes the commits. Agents never commit.

- **tester** writes the failing test for one scenario or UI behaviour (step definitions or Vitest).
- **frontend** makes it pass and refactors, without changing specs or tests.
- **reviewer** reviews the branch before every PR and changes nothing.

In the TDD step every scenario goes tester → frontend; the reviewer runs before every PR. Small changes (docs,
one-line fixes) are done directly. Planning (step 3) happens in plan mode with the owner, not in an agent.
A backend agent follows in phase 2.

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
