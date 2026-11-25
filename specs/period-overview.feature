# Stories: US-07, US-17
Feature: Period overview
  The overview shows the days of one billing period, newest on top, with one day open.

  Background:
    Given today is 2026-11-25
    And a billable label Project
    And a billable limit of 36:00 per period
    And a starting balance of 0:00

  Rule: Every day of the period up to today is shown, newest on top

    Scenario: The current week ends today
      Given a contract starting on 2026-10-05 with a weekly billing cycle
      When I open the overview
      Then the days shown are:
        | date       |
        | 2026-11-25 |
        | 2026-11-24 |
        | 2026-11-23 |

    Scenario: A past week shows all seven days, also without entries
      Given a contract starting on 2026-10-05 with a weekly billing cycle
      When I open the overview
      And I go to the previous period
      Then the days shown are:
        | date       |
        | 2026-11-22 |
        | 2026-11-21 |
        | 2026-11-20 |
        | 2026-11-19 |
        | 2026-11-18 |
        | 2026-11-17 |
        | 2026-11-16 |

    Scenario: A past month shows its first to its last day
      Given a contract starting on 2026-09-01 with a monthly billing cycle
      When I open the overview
      And I go to the previous period
      Then 31 days are shown, from 2026-10-31 to 2026-10-01

    Scenario: The first week also shows the days before the contract start
      Given a contract starting on 2026-11-18 with a weekly billing cycle
      When I open the overview
      And I go to the previous period
      Then 7 days are shown, from 2026-11-22 to 2026-11-16

    Scenario: Without a contract the overview shows weeks
      When I open the overview
      Then 3 days are shown, from 2026-11-25 to 2026-11-23

  Rule: Today is open, or in another period the most recent workday (Monday to Friday)

    Scenario: The current period opens on today
      Given a contract starting on 2026-10-05 with a weekly billing cycle
      When I open the overview
      Then the open day is 2026-11-25

    Scenario: The current period opens on today in the weekend too
      Given today is 2026-11-22
      And a contract starting on 2026-10-05 with a weekly billing cycle
      When I open the overview
      Then the open day is 2026-11-22

    Scenario: A past week opens on Friday, also when only the weekend has entries
      Given a contract starting on 2026-10-05 with a weekly billing cycle
      And an entry on 2026-11-21 from 09:00 to 12:00 labelled Project
      When I open the overview
      And I go to the previous period
      Then the open day is 2026-11-20

    Scenario: A past month opens on its last workday
      Given a contract starting on 2026-09-01 with a monthly billing cycle
      When I open the overview
      And I go to the previous period
      Then the open day is 2026-10-30

    Scenario: Back in the current period today is open again
      Given a contract starting on 2026-10-05 with a weekly billing cycle
      When I open the overview
      And I go to the previous period
      And I go to the next period
      Then the open day is 2026-11-25

  Rule: Periods run from the contract start or the earliest entry, whichever is first, to the current period

    Scenario: The current period is the last one
      Given a contract starting on 2026-10-05 with a weekly billing cycle
      When I open the overview
      Then I can go to the previous period
      And I cannot go to the next period

    Scenario: The period that holds the contract start is the first one
      Given a contract starting on 2026-11-18 with a weekly billing cycle
      When I open the overview
      And I go to the previous period
      Then I cannot go to the previous period
      And I can go to the next period

    Scenario: An earlier entry makes earlier periods available
      Given a contract starting on 2026-11-18 with a weekly billing cycle
      And an entry on 2026-11-10 from 09:00 to 12:00 labelled Project
      When I open the overview
      And I go to the previous period
      Then I can go to the previous period
      When I go to the previous period
      Then I cannot go to the previous period

    Scenario: A deleted entry does not make earlier periods available
      Given a contract starting on 2026-11-18 with a weekly billing cycle
      And an entry on 2026-11-10 from 09:00 to 12:00 labelled Project
      And I delete the entry on 2026-11-10
      When I open the overview
      And I go to the previous period
      Then I cannot go to the previous period

    Scenario: Without a contract or entries there is only the current week
      When I open the overview
      Then I cannot go to the previous period
      And I cannot go to the next period

    Scenario: With a contract that starts later there is only the current week
      Given a contract starting on 2026-12-07 with a weekly billing cycle
      When I open the overview
      Then I cannot go to the previous period
      And I cannot go to the next period
