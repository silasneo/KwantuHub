# KwantuHub Seed & Demo Data Strategy

## 1. Purpose & Strategy
This document establishes the official staging/demo seed data architecture for the KwantuHub MVP, ensuring rapid local testing, automated CI/CD verification, and stakeholder demonstration without polluting production databases with insecure credentials or unverified vendor data.

---

## 2. Seed Account Fixtures & Roles
The test seed suite provides authenticated personas for all supported marketplace roles:

| Role | Email | Password | Persona & Purpose |
| :--- | :--- | :--- | :--- |
| **Buyer** | `buyer@kwantuhub.com` | `Kwantu2026!` | Standard customer account with verified email, search history, and wishlist items |
| **Vendor** | `vendor@kwantuhub.com` | `Kwantu2026!` | Approved diaspora artisan with active storefront, listings, and inquiry history |
| **Admin** | `admin@kwantuhub.com` | `Kwantu2026!` | Platform governance administrator with moderation, verification, and analytics access |

---

## 3. Seed Execution
Seed fixtures are applied safely via the project seed script:
```bash
# Seed development / staging database with mock listings and categories
pnpm run db:seed
```

All demo passwords use bcrypt hashing with cost factor 10. Direct raw password storage is strictly prohibited across all environments.
