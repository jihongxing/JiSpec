Feature: Valid checkout

  Scenario: Checkout succeeds for a valid cart
    Given a cart with all items marked sellable
    And the cart total can be calculated
    When the user submits checkout
    Then an order is created
    And an OrderCreated event is emitted
