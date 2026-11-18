# Stories: US-04, US-07
Feature: Worked hours
  Worked hours are the total duration of all entries with a billable label.

  Background:
    Given these labels:
      | label   | billable |
      | Project | yes      |
      | Meeting | yes      |
      | Support | yes      |
      | Lunch   | no       |
      | Private | no       |
    And a contract starting on 2026-10-05 with a weekly billing cycle

  Scenario Outline: Duration of an entry
    Given an entry on 2026-10-05 from <start> to <end> labelled Project
    Then the duration of that entry is <duration>

    Examples:
      | start | end   | duration |
      | 09:00 | 17:00 | 8:00     |
      | 08:45 | 12:15 | 3:30     |
      | 13:10 | 13:25 | 0:15     |

  Scenario: Only entries with a billable label count as worked
    Given these entries on 2026-10-05:
      | start | end   | description   | label   |
      | 09:00 | 12:30 | Sprint work   | Project |
      | 12:30 | 13:00 | Lunch         | Lunch   |
      | 13:00 | 14:00 | Standup       | Meeting |
      | 14:00 | 17:15 | Sprint work   | Project |
      | 17:15 | 18:00 | Dentist       | Private |
    Then the worked hours on 2026-10-05 are 7:45

  Scenario: Worked hours of a week include every day from Monday to Sunday
    Given these entries:
      | date       | start | end   | label   |
      | 2026-10-04 | 09:00 | 17:00 | Project |
      | 2026-10-05 | 09:00 | 17:00 | Project |
      | 2026-10-11 | 10:00 | 12:00 | Support |
      | 2026-10-12 | 09:00 | 17:00 | Project |
    Then the worked hours in the week of 2026-10-05 are 10:00

  Scenario: A deleted entry no longer counts
    Given an entry on 2026-10-05 from 09:00 to 12:00 labelled Project
    And an entry on 2026-10-05 from 13:00 to 15:00 labelled Project
    When I delete the entry from 13:00 to 15:00
    Then the worked hours on 2026-10-05 are 3:00
