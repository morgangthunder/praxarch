# Praxarch

> A multi-tenant, **agentic Online Business Management Platform**. Praxarch runs autonomous business operations from a centralized command center — with the **Marketing OS** as its flagship subsystem for AI-driven content generation and end-to-end customer acquisition.

---

## Core Philosophy: "Modular Brain, Universal Plumbing"

Praxarch strictly decouples **AI reasoning** from **external integrations**.

- **The Brain (MoM — Manager of Managers):** A hierarchy of specialized agents (Strategist → Creative, Analyst, Buyer). Pure reasoning. Stable. Vendor-agnostic.
- **The Plumbing (Adapters):** Volatile external integrations (social platforms, ad networks, messaging, deploy targets). Swappable. Versioned. Isolated behind interfaces.

The Brain never speaks a vendor dialect. The Plumbing never makes a business decision.

```
  ┌──────────────┐        ┌──────────────────┐        ┌──────────────────┐
  │  THE BRAIN   │  emits │  UNIVERSAL EVENT  │  via   │   THE PLUMBING   │
  │ (MoM agents) │ ─────► │   CONTRACTS       │ ─────► │   (Adapters)     │
  │  reasoning   │        │  (typed DTOs)     │        │  Unified.to/Meta │
  └──────────────┘        └──────────────────┘        └──────────────────┘
```

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | **Next.js** (App Router, TS, Tailwind) | Multi-tenant UI, command center |
| Backend | **NestJS** (TS) | API gateway, event layer, webhook handler |
| Database | **Supabase / PostgreSQL** | Multi-tenant data (schema-per-tenant) |
| Orchestration | **n8n** (self-hosted, API-driven) | Async agentic workflow execution |
| Integrations | **Unified.to / Zernio** | Phase-1 unified API plumbing |
| Messaging | **Twilio** (WhatsApp) | HITL approval checkpoints |
| Deploy | **Coolify** | Self-hosted CI/CD target |

---

## Documentation Map

| Doc | Phase | Contents |
|---|---|---|
| [`docs/00-architecture-blueprint.md`](docs/00-architecture-blueprint.md) | **0** | The skeleton view — full system architecture & data flows |
| [`docs/01-ui-design-system.md`](docs/01-ui-design-system.md) | 1 | Design language, tokens, component conventions |
| [`docs/02-cicd-deployment.md`](docs/02-cicd-deployment.md) | 2 | One-button Coolify deploy flow |
| [`docs/03-whatsapp-hitl.md`](docs/03-whatsapp-hitl.md) | 3 | Async pause/resume HITL engine |
| [`docs/04-marketing-os-adapters.md`](docs/04-marketing-os-adapters.md) | 4 | Adapter pattern for Marketing OS |
| [`docs/adr/`](docs/adr/) | — | Architecture Decision Records |

---

## Repository Layout

```
praxarch/
├── docs/                     # Architecture & design docs (start here)
├── apps/
│   ├── web/                  # Next.js multi-tenant frontend
│   │   └── src/
│   │       ├── app/          # App Router routes (super-admin + client)
│   │       ├── components/   # UI primitives & feature modules
│   │       └── lib/          # Client utilities, design tokens
│   └── api/                  # NestJS backend
│       └── src/
│           ├── cicd/         # Phase 2: Coolify deploy module
│           ├── whatsapp/     # Phase 3: Twilio HITL engine
│           └── marketing/    # Phase 4: Marketing OS adapters
└── README.md
```

> **Status:** Architecture blueprint + reference scaffolding. This repo is the *implementation blueprint* — code is production-shaped reference scaffolding, not a fully wired runtime.
