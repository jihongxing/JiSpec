@SCN-ORDER-TECHNICAL-BOUNDARY
@REQ-ORD-002
@REQ-ORD-003
Feature: Upstream boundary alignment

  Scenario: Ordering consumes catalog availability without crossing ownership boundaries
    Given the technical solution assigns product availability ownership to catalog
    When ordering evaluates a checkout request
    Then ordering reads upstream availability instead of writing to catalog-owned data
    And the boundary remains explicit in the generated behavior draft
