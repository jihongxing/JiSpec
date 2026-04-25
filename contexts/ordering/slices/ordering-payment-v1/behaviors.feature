Feature: ordering-payment-v1

  Scenario: SCN-ORDERING-PAYMENT-V1-VALID - Valid operation
    Given a valid input
    When the operation is performed
    Then the result is successful

  Scenario: SCN-ORDERING-PAYMENT-V1-INVALID - Invalid operation
    Given an invalid input
    When the operation is performed
    Then an error is returned
