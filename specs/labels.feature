# Stories: US-04, US-23
Feature: Labels
  Each label is billable or non-billable. Once a label is used, its billable setting is fixed, so that
  worked hours and balances of earlier periods never change afterwards. Label names are unique, ignoring
  case and spaces around the name.

  Background:
    Given today is 2026-11-18
    And a billable label Support

  Scenario: The billable setting of an unused label can be changed
    When I mark Support as non-billable
    Then Support is non-billable

  Scenario: The billable setting of a used label cannot be changed
    Given an entry on 2026-11-18 from 09:00 to 10:00 labelled Support
    When I mark Support as non-billable
    Then the change is rejected
    And Support is billable

  Scenario: A used label can still be renamed
    Given an entry on 2026-11-18 from 09:00 to 10:00 labelled Support
    When I rename Support to Helpdesk
    Then the entry on 2026-11-18 is labelled Helpdesk
    And the worked hours on 2026-11-18 are 1:00

  Scenario: A label used only by deleted entries can be changed
    Given an entry on 2026-11-18 from 09:00 to 10:00 labelled Support
    And I delete that entry
    When I mark Support as non-billable
    Then Support is non-billable

  Scenario: A new label is billable by default
    When I create a label Travel
    Then Travel is billable

  Scenario: A new label can be created non-billable
    When I create a non-billable label Lunch
    Then Lunch is non-billable

  Scenario: Spaces around a label name are removed
    When I create a label "  Travel  "
    Then there is 1 label named Travel

  Scenario: Label names are unique, ignoring case and spaces
    When I create a label " support "
    Then the label is rejected
    And there is 1 label named Support

  Scenario: Accents count in label names
    Given a billable label Cafe
    When I create a label Café
    Then there is 1 label named Café
    And there is 1 label named Cafe

  Scenario: A label can be renamed to its own name in other capitals
    When I rename Support to SUPPORT
    Then there is 1 label named SUPPORT

  Scenario: A label name cannot be empty
    When I create a label "   "
    Then the label is rejected

  Scenario: A label cannot be renamed to an empty name
    When I rename Support to "   "
    Then the change is rejected
    And Support keeps its name

  Scenario: A label cannot be renamed to an existing name
    Given a billable label Meeting
    When I rename Meeting to SUPPORT
    Then the change is rejected
    And Meeting keeps its name

  Scenario: The name of a deleted label can be used again
    Given I delete the label Support
    When I create a non-billable label Support
    Then Support is non-billable
