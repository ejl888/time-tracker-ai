# Stories: US-05, US-06, US-08
Feature: Billed hours and balance with a monthly billing cycle
  With a monthly contract, planning, billed hours and balance are all per month; there is no weekly view.

  Background:
    Given today is 2026-11-30
    And a contract starting on 2026-10-01 with a monthly billing cycle
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

  Scenario: Entries before the contract start do not count, even in the first month
    Given a billable label Project
    And a contract starting on 2026-10-15 with a monthly billing cycle
    And I expect to bill 4:00 in 2026-10
    And an entry on 2026-10-14 from 09:00 to 17:00 labelled Project
    And an entry on 2026-10-15 from 09:00 to 17:00 labelled Project
    Then the balance after 2026-10 is +4:00
