# Stories: US-22
Feature: Adjacent entries stay adjacent
  When I change a time where two entries meet, the other entry follows, so they stay adjacent.

  Background:
    Given today is 2026-11-18
    And these entries on 2026-11-18:
      | start | end   |
      | 09:00 | 10:00 |
      | 10:00 | 12:00 |
      | 12:00 | 12:30 |
      | 13:00 | 15:00 |

  Rule: Changing an end time moves the start of the next adjacent entry

    Scenario: The next entry follows a later end time
      When I change the end time of the 09:00 entry to 10:30
      Then the entries on 2026-11-18 are:
        | start | end   |
        | 09:00 | 10:30 |
        | 10:30 | 12:00 |
        | 12:00 | 12:30 |
        | 13:00 | 15:00 |

    Scenario: The next entry follows an earlier end time
      When I change the end time of the 09:00 entry to 09:45
      Then the entries on 2026-11-18 are:
        | start | end   |
        | 09:00 | 09:45 |
        | 09:45 | 12:00 |
        | 12:00 | 12:30 |
        | 13:00 | 15:00 |

    Scenario: Only the directly adjacent entry moves
      When I change the end time of the 10:00 entry to 12:15
      Then the entries on 2026-11-18 are:
        | start | end   |
        | 09:00 | 10:00 |
        | 10:00 | 12:15 |
        | 12:15 | 12:30 |
        | 13:00 | 15:00 |

    Scenario: An entry after a gap does not move
      When I change the end time of the 12:00 entry to 12:45
      Then the entries on 2026-11-18 are:
        | start | end   |
        | 09:00 | 10:00 |
        | 10:00 | 12:00 |
        | 12:00 | 12:45 |
        | 13:00 | 15:00 |

    Scenario: The next entry is not changed when no time would be left
      When I change the end time of the 10:00 entry to 12:30
      Then the entries on 2026-11-18 are:
        | start | end   |
        | 09:00 | 10:00 |
        | 10:00 | 12:30 |
        | 12:00 | 12:30 |
        | 13:00 | 15:00 |
      And 2026-11-18 shows an overlap warning

  Rule: Changing a start time moves the end of the previous adjacent entry

    Scenario: The previous entry follows a later start time
      When I change the start time of the 10:00 entry to 10:15
      Then the entries on 2026-11-18 are:
        | start | end   |
        | 09:00 | 10:15 |
        | 10:15 | 12:00 |
        | 12:00 | 12:30 |
        | 13:00 | 15:00 |

    Scenario: An entry before a gap does not move
      When I change the start time of the 13:00 entry to 12:45
      Then the entries on 2026-11-18 are:
        | start | end   |
        | 09:00 | 10:00 |
        | 10:00 | 12:00 |
        | 12:00 | 12:30 |
        | 12:45 | 15:00 |

    Scenario: The previous entry is not changed when no time would be left
      When I change the start time of the 10:00 entry to 09:00
      Then the entries on 2026-11-18 are:
        | start | end   |
        | 09:00 | 10:00 |
        | 09:00 | 12:00 |
        | 12:00 | 12:30 |
        | 13:00 | 15:00 |
      And 2026-11-18 shows an overlap warning
