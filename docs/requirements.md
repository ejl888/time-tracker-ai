# Requirements

Status: draft — being filled in together with the owner.

## 1. Purpose

I want to be able to track my working time in a web app and a mobile app that stay in sync, replacing the current
Google Sheet.

## 2. Current way of working

Currently, I manually enter my working hours into a Google Sheet.

I want to record time per week, 4 weeks or per month, and I want to be able to see the total hours worked per
week, 4 weeks or per month.

I start by entering the date, the start time of my first task, then the end time of that first task, then the
description and a task label like (private, lunch, meeting, project, etc.). The start time of the next task is usually
the same as the end time of the previous task, but not always. At the following tasks I normally only enter the end
time, description and task label, because the start time is the same as the end time of the previous task.

At the start of a week I enter how many hours I want to work that week, the total amount of work is calculated
automatically based on which label is selected, some are non-billable like private or lunch and all others are
billable. I also enter how many hours I am allowed to work per week.

Hours that I work too much or too little carry over to the next week, so I can see how many hours I have worked in total
and how many hours I have left to work. I also want to be able to see how many hours I have worked in total and how many
hours I have left to work per week, 4 weeks or per month.

## 3. Users

I am the only user, no login required yet. I want to be able to use the app on my laptop and on my phone, and have the
data stay in sync between the two devices.

## 4. Core concepts

I normally work for one client at a time.
The client can have multiple projects I need to use to track my time.
I need some non-billable labels like private and lunch, etc. to track my time as well.
And I need time entries with date, start time, end time, description and a label to track my time.

| Concept | Meaning | Key fields |
|---|---|---|
| **Time entry** | One block of time on one day | date, start time, end time, description, label |
| **Label** | Category of a time entry (e.g. project, meeting, lunch, private) | name, billable yes/no |
| **Client** | Who the work is for; normally one at a time | name |
| **Project** | Work for a client; a client has one or more projects | name, client |
| **Contract** | Agreement with a client; fixes the billing cycle and limit | client, billing cycle (week or month), billable limit, starting balance, start date, end date |
| **Billing period** | One week or one month, depending on the contract's billing cycle | contract, start date, end date, expected billable hours |
| **Balance** | Hours worked but not yet billed (+), or billed but not yet worked (−); carried over period to period | derived, not entered |

Entered by me:

- **Billable limit** (contract) = the maximum I am allowed to invoice per period (currently 36 per week).
- **Starting balance** (contract) = 0 by default; set when I start using the app halfway through a project.
- **Expected billable hours** (each period) = how many hours I intend to bill that period. I decide whether to use built-up
  hours (e.g. enter 36 in a week I only work 32), or to keep them (e.g. enter 0 in a holiday week).
- **Time entries.**

Calculated by the app:

- **Worked hours** = sum of the durations of all entries with a billable label.
- **Billed hours** = min(billable limit, expected billable hours). Calculated, never entered.
- **Balance** = starting balance + total worked hours − total billed hours, carried over from period to period.
  Positive = hours built up (worked more than billed); negative = hours still to work (billed more than worked).

With a **monthly** contract, everything (planning, overviews, balance) is per month; there is no weekly view.

Example (billable limit 36 per week):

| Week | Expected billable | Billed | Worked | Balance after |
|---|---|---|---|---|
| 1 | 36 | 36 | 44 | +8 |
| 2 (day off, use built-up hours) | 36 | 36 | 32 | +4 |
| 3 (holiday, keep balance) | 0 | 0 | 0 | +4 |
| 4 | 36 | 36 | 30 | −2 |
| 5 | 40 (capped at limit) | 36 | 38 | 0 |

## 5. Functional requirements

_Priority: **Must** (first version), **Should** (soon after), **Could** (later)._

| ID | User story | Priority |
|---|---|---|
| US-01 | As a user, I want to add a time entry with date, start time, end time, description and label, so that I record what I did. | Must |
| US-02 | As a user, I want the start time of a new entry to be prefilled with the end time of the previous entry that day, so that I usually only enter end time, description and label. | Must |
| US-03 | As a user, I want to edit and delete time entries, so that I can correct mistakes. | Must |
| US-04 | As a user, I want to manage labels and mark each as billable or non-billable, so that worked hours are calculated correctly. | Must |
| US-05 | As a user, I want to enter my expected billable hours at the start of each billing period (week or month), so that the app knows what I will bill and how many hours I have left to work. | Must |
| US-06 | As a user, I want to set up a contract with billing cycle, billable limit and starting balance, so that the app calculates billed hours and balance correctly, also when I start halfway through a project. | Must |
| US-07 | As a user, I want to see an overview of the current billing period (week or month) with my entries per day, worked hours, billed hours, balance and hours left to work, so that I know where I stand. | Must |
| US-08 | As a user, I want the difference between worked and billed hours to carry over to the next billing period, so that I can work more one period and less the next while still billing the same hours each period. | Must |
| US-09 | As a user, I want to select a label by typing a few letters and picking from suggestions, so that I can log entries quickly. | Must |
| US-10 | As a user, I want the description field to suggest descriptions I used before while I type, and picking one to also fill in the label I used with it last time, so that I can log recurring tasks quickly. | Must |
| US-11 | As a user, I want to see worked hours, billed hours and balance per 4 weeks and per month, so that I have the same overviews as in my sheet. | Should |
| US-12 | As a user, I want to manage clients and projects and link an entry to a project, so that I know what my billable time was spent on. | Should |
| US-13 | As a user, I want to see totals per label and per project, so that I see how my time was spent. | Could |
| US-14 | As a user, I want to import my existing Google Sheet data, so that my history and balance carry over. | Could |
| US-15 | As a user, I want to start and stop a timer while I work, so that I don't have to type start and end times. | Could |

### Rules

- Times use the 24-hour clock and are entered in quarter-hour steps (e.g. 08:45); other minutes are still allowed.
- Durations are shown as hours and minutes (e.g. `7:30`); no extra rounding.
- An entry cannot run past midnight; split it into two entries.
- The app warns when entries on the same day overlap. Gaps between entries are allowed.
- Hours left to work = billed hours − worked hours in the current period. The balance is shown separately.

## 6. Reports and totals

- Per **week**, **4 weeks** and **month**: worked hours, billed hours, balance.
- **Running balance**: worked minus billed hours, carried over from period to period.
- **Hours left to work** in the current period.
- **4 weeks** = fixed consecutive blocks starting on a chosen date (e.g. matching invoice periods), not a rolling window.

## 7. Non-functional requirements

- Works on laptop (browser) and phone; data stays in sync between both (phase 2 backend, phase 4 mobile app).
- Single user; no login in the first version.
- Phase 1 stores data locally in the browser.
- User interface in English.

## 8. Out of scope

- Multiple users and login (until phase 3).
- AI features in the app.
- Linking entries to projects in the first version (label only; see US-12).
- Entries spanning midnight.

## 9. Open questions

1. **4-week blocks:** on which date does the first block start? Is it set per contract?
2. **Sync without login:** syncing laptop and phone needs the backend (phase 2) and some way to identify you. Decide in phase 2.
