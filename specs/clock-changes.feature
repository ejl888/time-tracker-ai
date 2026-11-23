# Stories: US-01
Feature: Entries on the nights the clocks change
  An entry is stored as moments in UTC plus its time zone, so its duration is the real time worked, also on the
  nights the clocks change. A time that does not exist (clocks go forward) moves forward by the gap; a time that
  occurs twice (clocks go back) is the earlier one. Times are in Europe/Amsterdam.

  Background:
    Given today is 2026-11-18
    And a billable label Project

  Scenario: An entry lasts an hour less on the night the clocks go forward
    Given an entry on 2026-03-29 from 01:00 to 04:00 labelled Project
    Then the duration of that entry is 2:00

  Scenario: An entry lasts an hour more on the night the clocks go back
    Given an entry on 2026-10-25 from 01:00 to 04:00 labelled Project
    Then the duration of that entry is 4:00

  Scenario: A time that does not exist moves forward by the gap
    Given an entry on 2026-03-29 from 02:30 to 04:00 labelled Project
    Then that entry starts at 03:30
    And the duration of that entry is 0:30

  Scenario: A time that occurs twice is the earlier one
    Given an entry on 2026-10-25 from 02:30 to 03:30 labelled Project
    Then the duration of that entry is 2:00

  Scenario: An end time that does not exist moves forward by the gap
    Given an entry on 2026-03-29 from 01:00 to 02:30 labelled Project
    Then the duration of that entry is 1:30

  Scenario: An end time that occurs twice is the earlier one
    Given an entry on 2026-10-25 from 01:00 to 02:30 labelled Project
    Then the duration of that entry is 1:30

  Scenario: A time that does not exist gives a warning
    When I enter an entry on 2026-03-29 from 02:30 to 04:00
    Then I am warned that 02:30 does not exist and becomes 03:30

  Scenario: A time that occurs twice gives a warning
    When I enter an entry on 2026-10-25 from 02:30 to 04:00
    Then I am warned that 02:30 occurs twice and the first one is used
