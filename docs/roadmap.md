# Roadmap

## Goal

Track working time in a web app and a mobile app that stay in sync, replacing the current Excel sheet.

## Phases

| Phase | What | Storage |
|---|---|---|
| 1 | React web app (Vite + TypeScript), hosted on the NAS | Browser localStorage |
| 2 | Spring Boot backend (Java) with REST API and database on the NAS; web app syncs to it | Database |
| 3 | User accounts and authentication, needed once the backend is reachable outside a VPN | Database |
| 4 | Phone: installable web app (PWA) first; whether a native app is still needed is decided later | Device + database |

## Next steps

1. ~~Requirements from the current Google Sheets workflow~~ → [requirements.md](requirements.md)
2. ~~GitHub remote, rebase merge only~~
3. ~~Clickable UI prototype~~ → [prototype/index.html](prototype/index.html); findings in [requirements.md](requirements.md)
4. ~~Gherkin specs for the Must stories~~ → [specs/](../specs)
5. Scaffold the web app (Vite, React, TypeScript, Vitest, Cucumber.js, CI); complete `CLAUDE.md`,
   `docs/data-model.md`; agent definitions in a separate PR
6. First story through the full spec → plan → TDD flow, ending in a PR
7. Deploy to the NAS: Dockerfile, nginx, compose file, reverse proxy and certificate for `timetracker.codeable.nl`
8. Backend and sync on the NAS, once the Must stories work on the laptop; first choose login or VPN (decision 17)

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Start with a web app on localStorage, add the backend later | Get something usable quickly; learn the domain before building the server |
| 2 | Data access behind a repository interface | Swap localStorage for the API in phase 2 without touching the UI |
| 3 | Client-generated UUIDs | Web and mobile can create records offline without ID conflicts |
| 4 | `createdAt`, `updatedAt`, `deleted` on every record | Needed to detect changes and to sync deletions |
| 5 | Store moments in UTC (ISO 8601); time entries also store their IANA time zone and are shown in it | UTC avoids time zone bugs between devices and maps to Java `Instant`; the stored zone keeps entry times from shifting when travelling |
| 6 | No AI features in the app | Owner's choice; AI is used to build the app, not inside it |
| 7 | Branch and PR per feature | Reviewable history; every change is approved |
| 8 | Conventional Commits | Consistent, scannable history; enables changelog tooling later |
| 9 | Every commit builds and passes all tests | `git bisect` and reverts stay reliable |
| 10 | Rebase merge, no squash | Linear history that keeps each meaningful commit |
| 11 | No GitHub branch protection on `main`; rely on the `CLAUDE.md` rule | Branch protection on private repos requires a paid plan |
| 12 | Spec-driven development: requirements → Gherkin specs → plan → TDD | Specs act as guardrail for AI-written code; examples are easier to review than code |
| 13 | Domain rules as executable Gherkin in `specs/`, shared by web and backend | Same behaviour provably in phase 1 and phase 2, which matters for sync |
| 14 | Implementation never changes specs or existing tests to make them pass | Prevents an AI from "fixing" the test instead of the code |
| 15 | Host on the owner's Synology NAS with Docker: nginx now, the backend later, in one compose file | Containers already run there; one mechanism for both phases |
| 16 | The app lives at `https://timetracker.codeable.nl` (own subdomain, not a path) and keeps that address | localStorage and cookies are per origin: no sharing with other apps, and data is not lost by moving; DSM's reverse proxy routes by host name; the backend can use `/api` on the same origin without CORS |
| 17 | Phase 1 is public; before the backend stores data, choose between login (phase 3 first) and VPN-only access | In phase 1 the NAS serves only static files and stores no data; once it does, it must not be open without protection |
