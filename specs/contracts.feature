# Stories: US-05, US-06
Feature: Contract and expected billable hours
  The contract fixes the billing cycle, the billable limit, the contract start and the starting balance.
  Each period I enter the hours I expect to bill. Once expected hours are entered, the billing cycle, the
  contract start and the billable limit are locked, so billed hours of earlier periods never change.

  Background:
    Given a contract starting on 2026-10-05 with a weekly billing cycle
    And a billable limit of 36:00 per period
    And a starting balance of 0:00

  Rule: The billable limit must be more than 0:00

    Scenario: A billable limit of 0:00 is rejected
      When I change the billable limit to 0:00
      Then the change is rejected

  Rule: Expected billable hours cannot be negative

    Scenario: Negative expected billable hours are rejected
      When I enter -4:00 as the expected billable hours for the week of 2026-10-05
      Then the change is rejected

  Rule: Billing cycle, contract start and billable limit are locked once expected hours are entered

    Scenario: The contract can change while no expected hours are entered
      When I change the billable limit to 32:00
      Then the change is saved

    Scenario Outline: The contract is locked once expected hours are entered
      Given I expect to bill 36:00 in the week of 2026-10-05
      When I change the <field> to <value>
      Then the change is rejected

      Examples:
        | field          | value      |
        | billing cycle  | monthly    |
        | contract start | 2026-10-12 |
        | billable limit | 32:00      |

    Scenario: The starting balance can always change
      Given I expect to bill 36:00 in the week of 2026-10-05
      When I change the starting balance to 5:00
      Then the change is saved

  Rule: The period that holds the contract start is the first period

    Scenario: Expected hours can be entered for the week the contract starts in, even midweek
      Given I change the contract start to 2026-10-07
      When I enter 36:00 as the expected billable hours for the week of 2026-10-05
      Then the change is saved

    Scenario: Expected hours for a period before the contract start are rejected
      When I enter 36:00 as the expected billable hours for the week of 2026-09-28
      Then the change is rejected
