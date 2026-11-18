# Stories: US-05, US-06, US-08
Feature: Billed hours and balance
  At the start of each billing period I enter the hours I expect to bill. The app bills at most the
  contract's billable limit and carries the difference between worked and billed hours over to the
  next period.

  Background:
    Given a contract starting on 2026-10-05 with a weekly billing cycle
    And a billable limit of 36:00 per period
    And a starting balance of 0:00

  Rule: Billed hours are the expected billable hours, capped at the billable limit

    Scenario Outline: Billed hours for a week
      Given I expect to bill <expected> in the week of 2026-10-05
      Then the billed hours for the week of 2026-10-05 are <billed>

      Examples:
        | expected | billed |
        | 36:00    | 36:00  |
        | 32:00    | 32:00  |
        | 0:00     | 0:00   |
        | 40:00    | 36:00  |

    Scenario: No expected billable hours entered
      Then the billed hours for the week of 2026-10-05 are 0:00

  Rule: Balance = starting balance + worked hours - billed hours, carried over from period to period

    Scenario: The five weeks from the requirements example
      Given these weeks:
        | week of    | expected | worked |
        | 2026-10-05 | 36:00    | 44:00  |
        | 2026-10-12 | 36:00    | 32:00  |
        | 2026-10-19 | 0:00     | 0:00   |
        | 2026-10-26 | 36:00    | 30:00  |
        | 2026-11-02 | 40:00    | 38:00  |
      Then the balance after each week is:
        | week of    | balance |
        | 2026-10-05 | +8:00   |
        | 2026-10-12 | +4:00   |
        | 2026-10-19 | +4:00   |
        | 2026-10-26 | -2:00   |
        | 2026-11-02 | 0:00    |

    Scenario: The balance carried into a week is the balance after the previous week
      Given these weeks:
        | week of    | expected | worked |
        | 2026-10-05 | 36:00    | 44:00  |
      Then the balance carried into the week of 2026-10-12 is +8:00

    Scenario: Starting halfway through a project
      Given a starting balance of 5:00
      And these weeks:
        | week of    | expected | worked |
        | 2026-10-05 | 36:00    | 30:00  |
      Then the balance after the week of 2026-10-05 is -1:00

  Rule: Hours left to work = billed hours - worked hours in the period

    Scenario Outline: Hours left halfway through a week
      Given I expect to bill <expected> in the week of 2026-10-05
      And I worked 20:00 in the week of 2026-10-05
      Then the hours left to work in the week of 2026-10-05 are <left>

      Examples:
        | expected | left   |
        | 36:00    | 16:00  |
        | 40:00    | 16:00  |
        | 16:00    | -4:00  |
