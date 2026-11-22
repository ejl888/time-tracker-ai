# Stories: US-02
Feature: Prefilled start and end time of a new entry
  The start time of a new entry is guessed from earlier entries, so that I usually only adjust the end time.
  The end time starts equal to the start time.

  Background:
    Given today is 2026-11-18

  Scenario: The start time follows the latest entry of the same day
    Given these entries on 2026-11-18:
      | start | end   |
      | 09:00 | 10:00 |
      | 13:00 | 14:30 |
      | 10:00 | 12:30 |
    When I start a new entry on 2026-11-18
    Then the start time is 14:30
    And the end time is 14:30

  Scenario: The first entry of a day starts like the same weekday a week earlier
    Given these entries:
      | date       | start | end   |
      | 2026-11-11 | 08:30 | 12:00 |
      | 2026-11-11 | 07:45 | 08:30 |
      | 2026-11-17 | 09:15 | 12:00 |
    When I start a new entry on 2026-11-18
    Then the start time is 07:45

  Scenario: Without entries a week earlier, use the most recent earlier day with entries
    Given these entries:
      | date       | start | end   |
      | 2026-11-13 | 08:00 | 12:00 |
      | 2026-11-16 | 08:15 | 12:00 |
    When I start a new entry on 2026-11-18
    Then the start time is 08:15

  Scenario: Without any earlier entries, start at 09:00
    When I start a new entry on 2026-11-18
    Then the start time is 09:00
    And the end time is 09:00

  Scenario: Deleted entries are ignored
    Given an entry on 2026-11-17 from 08:00 to 12:00
    And an entry on 2026-11-18 from 09:00 to 11:00
    When I delete the entry on 2026-11-18
    And I start a new entry on 2026-11-18
    Then the start time is 08:00

  Scenario: When the day already ends at midnight, nothing is prefilled
    Given these entries on 2026-11-18:
      | start | end   |
      | 22:00 | 24:00 |
    When I start a new entry on 2026-11-18
    Then nothing is prefilled
