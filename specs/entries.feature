# Stories: US-01, US-03
Feature: Adding, editing and deleting time entries

  Background:
    Given today is 2026-11-18
    And a billable label Project

  Scenario: Entries of a day are listed in time order
    Given I add an entry on 2026-11-18 from 13:00 to 14:00 labelled Project
    And I add an entry on 2026-11-18 from 09:00 to 12:00 labelled Project
    Then the entries on 2026-11-18 are:
      | start | end   |
      | 09:00 | 12:00 |
      | 13:00 | 14:00 |

  Scenario Outline: The end time must be after the start time
    When I add an entry on 2026-11-18 from <start> to <end> labelled Project
    Then the entry is rejected

    Examples:
      | start | end   | why                       |
      | 10:00 | 09:30 | end before start          |
      | 10:00 | 10:00 | zero duration             |
      | 22:00 | 00:30 | would run past midnight   |

  Scenario: An entry can end at midnight
    When I add an entry on 2026-11-18 from 22:00 to 24:00 labelled Project
    Then the entry is saved
    And the duration of that entry is 2:00

  Scenario: A label is required
    When I add an entry on 2026-11-18 from 09:00 to 10:00 without a label
    Then the entry is rejected

  Scenario: A description is optional
    When I add an entry on 2026-11-18 from 09:00 to 10:00 labelled Project without a description
    Then the entry is saved

  Scenario: An entry cannot be added after today
    When I add an entry on 2026-11-19 from 09:00 to 10:00 labelled Project
    Then the entry is rejected

  Scenario: Overlapping entries are saved with a warning
    Given I add an entry on 2026-11-18 from 09:00 to 10:30 labelled Project
    When I add an entry on 2026-11-18 from 10:00 to 11:00 labelled Project
    Then the entry is saved
    And 2026-11-18 shows an overlap warning

  Scenario: Adjacent entries and gaps do not overlap
    Given I add an entry on 2026-11-18 from 09:00 to 10:00 labelled Project
    And I add an entry on 2026-11-18 from 10:00 to 11:00 labelled Project
    And I add an entry on 2026-11-18 from 13:00 to 14:00 labelled Project
    Then 2026-11-18 shows no overlap warning

  Scenario: Editing an entry
    Given I add an entry on 2026-11-18 from 09:00 to 10:00 labelled Project
    When I change the end time of that entry to 11:15
    Then the duration of that entry is 2:15

  Scenario: Deleting an entry
    Given I add an entry on 2026-11-18 from 09:00 to 10:00 labelled Project
    When I delete that entry
    Then there are no entries on 2026-11-18
