# Requirements

Status: draft — being filled in together with the owner.

Clickable prototype: [prototype/index.html](prototype/index.html) (open in a browser; sample data, nothing is saved).

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
| **Contract** | Agreement with a client; fixes the billing cycle and limit. Contracts follow one another and never overlap | client, billing cycle (week or month), billable limit, starting balance, start date, end date |
| **Billing period** | One week or one month, depending on the contract's billing cycle | contract, start date, end date, expected billable hours |
| **Balance** | Hours worked but not yet billed (+), or billed but not yet worked (−); carried over period to period within a contract | derived, not entered |

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
- Each **contract has its own balance**, starting at its starting balance. Built-up hours do not carry over to the next
  contract. The date of an entry decides which contract it belongs to.

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
| US-01 | As a user, I want to add a time entry to a day with start time, end time, description and label, so that I record what I did. | Must |
| US-02 | As a user, I want the start time of a new entry to be prefilled, and the end time to start equal to it, so that I usually only adjust the end time and pick a description. See rules for where the start time comes from. | Must |
| US-03 | As a user, I want to edit and delete time entries in place within the day, so that I can correct mistakes without opening a separate form. | Must |
| US-04 | As a user, I want to manage labels and mark each as billable or non-billable, so that worked hours are calculated correctly. | Must |
| US-05 | As a user, I want to enter my expected billable hours at the start of each billing period (week or month), so that the app knows what I will bill and how many hours I have left to work. | Must |
| US-06 | As a user, I want to set up a contract with billing cycle, billable limit and starting balance, so that the app calculates billed hours and balance correctly, also when I start halfway through a project. | Must |
| US-07 | As a user, I want to see an overview of the current billing period (week or month) with balance carried in, expected billable hours, worked hours, hours left to work and my entries per day, so that I know where I stand. | Must |
| US-08 | As a user, I want the difference between worked and billed hours to carry over to the next billing period, so that I can work more one period and less the next while still billing the same hours each period. | Must |
| US-09 | As a user, I want to select a label by typing a few letters and picking from suggestions, so that I can log entries quickly. | Must |
| US-10 | As a user, I want the description field to suggest descriptions I used before while I type, and picking one to also fill in the label I used with it last time, so that I can log recurring tasks quickly. | Must |
| US-11 | As a user, I want to see worked hours, billed hours and balance per 4 weeks and per month, so that I have the same overviews as in my sheet. | Should |
| US-12 | As a user, I want to manage clients and projects and link an entry to a project, so that I know what my billable time was spent on. | Should |
| US-13 | As a user, I want to see totals per label and per project, so that I see how my time was spent. | Could |
| US-14 | As a user, I want to import my existing Google Sheet data, so that my history and balance carry over. | Could |
| US-15 | As a user, I want to start and stop a timer while I work, so that I don't have to type start and end times. | Could |
| US-16 | As a user, I want the active day to always show an empty entry row at the bottom, and Enter to save it and open the next empty row, so that I can log several entries in a row without extra clicks. | Must |
| US-17 | As a user, I want to make a day active by clicking it, while other days collapse into a one-line summary, so that I see the day I work on and still have an overview of the period. | Must |
| US-18 | As a user, I want the period totals to stay visible at the top while I scroll, so that I always see where I stand. | Must |
| US-19 | As a user, I want to swipe left and right on my phone to go to the next and previous period, so that I can browse periods with one hand. | Must |
| US-20 | As a user, I want to add a new contract when my contract or client changes, with its own billing cycle, limit and starting balance, so that each contract has its own balance. | Should |
| US-21 | As a user, I want to move an entry to another day by dragging it, so that I can fix an entry logged on the wrong day. | Could |
| US-22 | As a user, I want the next entry's start time to follow when I change an entry's end time (and the previous entry's end time to follow when I change a start time), so that adjacent entries stay adjacent without editing both. | Should |
| US-23 | As a user, I want to create a new label by typing a name that doesn't exist yet in the label field and confirming it, billable by default and optionally marked non-billable in the confirmation, so that I can log an entry with a new label without leaving the entry row. | Should |

### Rules

- Times use the 24-hour clock and are entered in quarter-hour steps (e.g. 08:45); other minutes are still allowed.
- Durations are shown as hours and minutes (e.g. `7:30`); no extra rounding.
- An entry cannot run past midnight; split it into two entries. Ending at exactly midnight is allowed (shown as `24:00`).
- The app warns when entries on the same day overlap. Gaps between entries are allowed.
- Hours left to work = billed hours − worked hours in the current period. The balance is shown separately.
- Billed hours are not shown separately; when the expected billable hours exceed the limit, a note says they are capped.
- Expected billable hours are entered once the period has started; future periods cannot be opened.
- When no expected billable hours are entered for a period, billed hours are 0.
- Weeks run from Monday to Sunday.
- Every entry needs a label; the description is optional.
- A label's billable setting cannot be changed once an entry (not deleted) uses it, so earlier periods never change.
  Create a new label instead. Renaming a label is always allowed.
- Label names are trimmed (spaces at the start and end are removed) and unique, ignoring upper and lower case.
  A deleted label's name can be used again.
- Label names cannot be empty.
- Deleting a label asks for confirmation. A deleted label keeps its billable setting and stays on the entries that use
  it, shown as e.g. "Support (deleted)"; it can no longer be picked for new entries.

#### Entering time

- Entries are added and edited inline within a day; there is no date field, the day determines the date.
- Start time of a new entry: the end time of the previous entry that day. For the first entry of a day: the first start
  time on the same weekday a week earlier, otherwise on the most recent earlier day with entries, otherwise 09:00.
- The end time starts equal to the start time; the app only reports "end must be after start" once the end time was
  changed or on save.
- Enter saves, Esc cancels. After saving a new entry the next empty row opens with the cursor on the end time.
- New label (US-23): when the typed label matches no existing label, the suggestions offer "Create label …".
  A confirmation shows the name and a billable checkbox (checked by default). Cancelling creates nothing and
  keeps the typed text in the label field.
- Linked times (US-22): when I change an entry's end time and the next entry started exactly at the old end time, that
  entry's start time moves along; when I change a start time, the previous entry's end time follows the same way.
  Only the directly adjacent entry changes; entries after a gap are left alone. If the adjacent entry would end up
  with no time left, it is not changed and the day shows an overlap warning instead.

#### Overview layout

- The newest day is on top; within a day, entries are in time order with the empty row at the bottom.
- Days after today are not shown.
- One day is active (today by default; in another period the most recent workday). Other days show one line: date,
  worked hours, number of entries, overlap warning, and a small timeline.
- Phone: the header is a menu icon (Overview, Settings), the period with ‹ › arrows and a today button, and one row of
  totals: balance in, expected, worked, left. Swiping left/right changes the period.
- Laptop: the app title and tabs are shown, and the totals include a short explanation each.

#### Contracts

- Contracts follow one another and never overlap; an entry's date decides its contract.
- Each contract has its own balance; going to a period of an earlier contract shows that contract's balance.

## 6. Reports and totals

- Per **week**, **4 weeks** and **month**: worked hours, billed hours, balance.
- **Running balance**: worked minus billed hours, carried over from period to period within a contract.
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
- Logging time in the future.
- Moving entries to another day, other than by drag and drop (US-21).

## 9. Open questions

1. **4-week blocks:** on which date does the first block start? Is it set per contract?
2. **Sync without login:** syncing laptop and phone needs the backend (phase 2) and some way to identify you. Decide in phase 2.
