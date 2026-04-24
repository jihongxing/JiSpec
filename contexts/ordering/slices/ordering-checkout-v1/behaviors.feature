Feature: Checkout MVP

  Scenario: Successful checkout creates an order
    Given a valid cart with all items sellable
    And the total is calculable
    When checkout is submitted
    Then an order is created
    And OrderCreated is emitted

  Scenario: Checkout rejects an unavailable item
    Given a cart with an unavailable item
    When checkout is submitted
    Then checkout is rejected
    And no order is created
