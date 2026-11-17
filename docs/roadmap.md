# Roadmap

## Goal

Track working time in a web app and a mobile app that stay in sync, replacing the current Excel sheet.

## Phases

| Phase | What | Storage |
|---|---|---|
| 1 | React web app (Vite + TypeScript) | Browser localStorage |
| 2 | Spring Boot backend (Java) with REST API and database; web app syncs to it | Database |
| 3 | User accounts and authentication | Database |
| 4 | Mobile app syncing with the web app via the backend | Device + database |

## Next steps

1. Analyse the current Excel workflow → input for the data model and screens
2. Clickable UI prototype
3. GitHub remote, protect `main`
4. Complete `CLAUDE.md`, agent definitions, `docs/data-model.md`
5. First feature on a branch, ending in a PR

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Start with a web app on localStorage, add the backend later | Get something usable quickly; learn the domain before building the server |
| 2 | Data access behind a repository interface | Swap localStorage for the API in phase 2 without touching the UI |
| 3 | Client-generated UUIDs | Web and mobile can create records offline without ID conflicts |
| 4 | `createdAt`, `updatedAt`, `deleted` on every record | Needed to detect changes and to sync deletions |
| 5 | Store times in UTC (ISO 8601) | Avoid time zone bugs between devices |
| 6 | No AI features in the app | Owner's choice; AI is used to build the app, not inside it |
| 7 | Branch and PR per feature | Reviewable history; every change is approved |
| 8 | Conventional Commits | Consistent, scannable history; enables changelog tooling later |
| 9 | Every commit builds and passes all tests | `git bisect` and reverts stay reliable |
| 10 | Rebase merge, no squash | Linear history that keeps each meaningful commit |
