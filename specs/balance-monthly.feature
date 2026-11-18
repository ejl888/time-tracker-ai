# Stories: US-05, US-06, US-08
Feature: Billed hours and balance with a monthly billing cycle
  With a monthly contract, planning, billed hours and balance are all per month; there is no weekly view.

  Background:
    Given a contract starting on 2026-10-01 with a monthly billing cycle
    And a billable limit of 150:00 per period
    And a starting balance of 0:00

  Scenario: Balance over two months
    Given these months:
      | month   | expected | worked |
      | 2026-10 | 150:00   | 160:00 |
      | 2026-11 | 160:00   | 140:00 |
    Then the billed hours for 2026-11 are 150:00
    And the balance after each month is:
      | month   | balance |
      | 2026-10 | +10:00  |
      | 2026-11 | 0:00    |
