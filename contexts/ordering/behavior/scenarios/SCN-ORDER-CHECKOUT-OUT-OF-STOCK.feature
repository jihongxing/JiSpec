Feature: Reject invalid checkout

  Scenario: Checkout fails when a cart contains unavailable items
    Given a cart with at least one item marked not sellable
    When the user submits checkout
    Then checkout is rejected
    And no order is created
