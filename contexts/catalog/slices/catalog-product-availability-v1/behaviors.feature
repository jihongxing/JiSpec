Feature: Product Availability MVP

  @SCN-CATALOG-PRODUCT-AVAILABLE
  @REQ-CAT-001
  Scenario: Catalog exposes products that are available for sale
    Given a product is available for sale
    When the catalog is queried for sellable products
    Then the product is included in the available product result

  @SCN-CATALOG-TECHNICAL-OWNERSHIP
  @REQ-CAT-001
  Scenario: Catalog retains ownership of product availability and saleability language
    Given the technical solution defines catalog as the owner of product availability
    When catalog behavior is drafted from the source documents
    Then product availability remains catalog-owned
    And behavior scenarios stay aligned with the technical solution boundary
