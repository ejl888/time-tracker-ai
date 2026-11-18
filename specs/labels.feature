# Stories: US-04
Feature: Labels
  Each label is billable or non-billable. Once a label is used, its billable setting is fixed, so that
  worked hours and balances of earlier periods never change afterwards.

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
