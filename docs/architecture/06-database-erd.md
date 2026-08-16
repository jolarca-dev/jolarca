# 06 — Database ERD (logical)

```mermaid
erDiagram
    User ||--o| UserProfile : has
    User ||--o{ ConsentRecord : grants
    User ||--o| SellerProfile : operates
    User ||--o{ Cart : owns
    User ||--o{ Order : places
    User ||--o{ ErasureRequest : requests
    SellerProfile ||--o{ ProductListing : lists
    Category ||--o{ ProductListing : contains
    Cart ||--o{ CartItem : holds
    ProductListing ||--o{ CartItem : referenced
    Order ||--o{ OrderItem : contains
    Order ||--o| PaymentRecord : charged
    Order ||--o| Shipment : ships
    Order ||--o| CommercialInvoice : invoiced
    Shipment ||--o{ TrackingEvent : tracks
    ProductListing ||--o{ OrderItem : snapshotted
    IdempotencyRecord }o--|| Order : "checkout dedupe"
    StripeWebhookEvent }o--o| PaymentRecord : reconciles
    AuditLog }o..o| User : "actor (nullable)"
    AIRequestLog }o..|| User : "no user linkage by design"
```

**pgcrypto/encryption annotations:** `UserProfile.full_name|phone|date_of_birth|street_address`
→ `EncryptedTextField` (Fernet, `pii_classification` per field; see COMPLIANCE_MATRIX).
