@SCN-CATALOG-PRODUCT-AVAILABLE
@REQ-CAT-001
Feature: Expose available products

  Scenario: Catalog exposes products that are available for sale
    Given a product is available for sale
    When the catalog is queried for sellable products
    Then the product is included in the available product result
