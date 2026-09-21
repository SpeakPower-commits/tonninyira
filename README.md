<div align="center">

<img src="logo-full-transparent.png" alt="Tonninyira — a market stall with three traders" width="200">

### Discover locally. Order simply. Work transparently.

A local-first marketplace for Kampala's neighbourhood stalls. Browse without an account,
pay with MTN or Airtel mobile money, and have it delivered by a verified rider.

<p>
  <a href="https://github.com/SpeakPower-commits/tonninyira/tree/tonninyira-enhancements"><img src="https://img.shields.io/badge/branch-tonninyira--enhancements-E23F25?style=for-the-badge&logo=git&logoColor=white" alt="Active branch"></a>
  <img src="https://img.shields.io/badge/frontend-HTML%20%2B%20vanilla%20JS-F5B400?style=for-the-badge&logo=javascript&logoColor=1C1410" alt="Frontend">
  <img src="https://img.shields.io/badge/backend-Supabase-4C9A5B?style=for-the-badge&logo=supabase&logoColor=white" alt="Backend">
  <img src="https://img.shields.io/badge/hosting-GitHub%20Pages-24292f?style=for-the-badge&logo=github&logoColor=white" alt="Hosting">
  <img src="https://img.shields.io/badge/status-pre--launch-8a6100?style=for-the-badge" alt="Status">
</p>

<a href="https://speakpower-commits.github.io/tonninyira/index.html"><strong>Open the live marketplace →</strong></a>

</div>

<br>

<img src="assets/market/optimized/2.webp" alt="A busy open-air produce market in Kampala, with traders under umbrellas selling fruit, vegetables and dried goods" width="100%">

<div align="center"><sub>The businesses Tonninyira brings online — open-air produce traders in Kampala.</sub></div>

---

## What is Tonninyira?

People should be able to find a good local stall without signing up first. The platform should
only ask for an account when real money or private customer data is involved.

That gives one straight path: **browse → choose → basket → sign in → pay → track**. Discovery is
public; everything transactional sits behind a verified account.

Every account — customer, vendor, rider — is created with an **email address and a password**. The
phone number is optional at sign-up and collected where it is actually needed: at checkout for a
customer, on the application for a vendor or rider, because that is the number a rider calls. Nobody
waits for an SMS to get in.

| Area | What you find there |
| --- | --- |
| **Eats** | Meals, snacks and ready-to-eat food from local stalls and food businesses. |
| **Shop** | Groceries, raw foods, second-hand goods and everyday household items. |

---

## How ordering works

```mermaid
flowchart LR
  A["Browse<br/>no account needed"] --> B["Add to basket"]
  B --> C{"Sign in"}
  C -->|"Email + password"| D["Pay<br/>MTN / Airtel"]
  D --> E["Track delivery"]
  style A fill:#F5B400,stroke:#1C1410,color:#1C1410
  style D fill:#E23F25,stroke:#1C1410,color:#ffffff
  style E fill:#4C9A5B,stroke:#1C1410,color:#ffffff
```

---

## How a stall joins

Every vendor creates an account, submits an application with their trading credentials, and
waits for review. Nothing reaches the storefront unapproved.

```mermaid
flowchart LR
  A["Create account<br/>email + password"] --> B["Submit application<br/>KCCA · URA · UNBS"]
  B --> C["Status: pending"]
  C --> D{"Admin review"}
  D -->|"Approve"| E["Live on the storefront"]
  D -->|"Reject"| F["Not published"]
  style C fill:#F5B400,stroke:#1C1410,color:#1C1410
  style E fill:#4C9A5B,stroke:#1C1410,color:#ffffff
  style F fill:#9C897A,stroke:#1C1410,color:#ffffff
```

> [!IMPORTANT]
> **The gate is enforced in the database, not the interface.** A row-level security policy lets
> an applicant create only their own record, and only in a `pending` state — so a vendor cannot
> approve themselves even by calling the API directly. `vendors_public` serves approved rows
> only, so an unreviewed stall is invisible to shoppers.

---

## Architecture

```mermaid
flowchart TB
  B["Browser<br/>HTML · CSS · vanilla JS"] --> P["GitHub Pages<br/>static delivery"]
  B --> S["Supabase"]
  S --> AU["Auth<br/>email + password"]
  S --> DB[("PostgreSQL<br/>+ row-level security")]
  S --> EF["Edge Functions"]
  EF --> FW["Flutterwave<br/>mobile money"]
  style B fill:#F5B400,stroke:#1C1410,color:#1C1410
  style S fill:#4C9A5B,stroke:#1C1410,color:#ffffff
  style FW fill:#E23F25,stroke:#1C1410,color:#ffffff
```

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Vanilla JS | No framework weight — it has to stay fast on an ordinary Android phone and a thin connection. |
| Backend | Supabase | Auth, PostgreSQL, row-level security and serverless functions in one platform. |
| Hosting | GitHub Pages | Static delivery straight from the repository, no build step. |
| Payments | Flutterwave | MTN and Airtel mobile money, the way Uganda actually pays. |

---

## Marketplace economics

Partners are shown what they earned, what Tonninyira took, and what they are owed — as three
separate figures, never one net number.

```mermaid
flowchart LR
  A["Order value"] --> B["Partner gross earnings"]
  B --> C["Tonninyira platform share<br/>5%"]
  B --> D["Partner net payout"]
  style C fill:#E23F25,stroke:#1C1410,color:#ffffff
  style D fill:#4C9A5B,stroke:#1C1410,color:#ffffff
```

---

## Project status

Built and deployed; not yet exercised end to end. Stated plainly so nobody tests against the
wrong expectation.

| Area | State |
| --- | --- |
| Storefront and public browsing | ✅ Live |
| Accounts, email sign-up and password sign-in | ✅ Live |
| Vendor / rider sign-up and approval queue | ✅ Live |
| Admin command centre | ✅ Live |
| Mobile-money payments | ⏳ Built, not yet tested end to end |
| Rider dispatch and delivery tracking | ⏳ Built, not yet tested end to end |

---

## Roadmap

**Near term**
- End-to-end mobile-money verification against the Flutterwave sandbox
- Vendor and rider notification centre
- Customer order tracking through each fulfilment stage

**Next**
- Map-based location selection and road-aware delivery routing
- Partner performance dashboards
- Repeat-purchase recommendations

**Longer term**
- Demand heatmaps and delivery-zone planning from real order geography
- Unit-economics modelling per stall, per neighbourhood

---

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — data model, authentication and
  authorization, wishlist design, analytics event model, security notes, repository layout
  and local development.
- **[Live site](https://speakpower-commits.github.io/tonninyira/index.html)** — the running marketplace.

---

<div align="center">

**Built for local commerce. Designed to scale with evidence.**

Tonninyira · Kampala, Uganda

</div>
