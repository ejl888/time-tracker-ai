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
  Before opening a PR, verify with `git rebase --exec "<build and test command>" main`.
- **Rebase merge, no squash.** Every commit lands on `main` as-is, so each must be meaningful.
  Clean up branch history (fold WIP and fixup commits) before merging.
- **Small vertical slices.** Each feature is usable end to end (UI + storage + tests) before starting the next.
- **No AI features in the app itself.**

## Stack

- **Web (phase 1):** React + TypeScript (Vite), browser localStorage
- **Backend (phase 2+):** Java, Spring Boot

Build, test and lint commands will be added here once the project is scaffolded.

## Design rules (keep sync possible)

- Components never call `localStorage` directly; all data access goes through a repository interface.
- IDs are UUIDs generated on the client.
- Every record has `createdAt`, `updatedAt` and `deleted` (soft delete).
- Times are stored in UTC (ISO 8601) and converted to local time only for display.
- The data model in `docs/` is the contract; update it in the same PR as any model change.
