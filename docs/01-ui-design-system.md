# Phase 1 — UI Design System

**Praxarch Frontend Design Language**
*Surfaces: Super-Admin Control Center + White-labeled Client Dashboard*

The UI mirrors the visual rigor of **Linear, Dub.co, Supabase, Langfuse, and Trigger.dev**: monochromatic, dense, calm — with color reserved as a *signal*.

---

## 1. Principles

| Principle | Implementation |
|---|---|
| **Monochromatic base** | All surfaces/borders/text are grayscale via CSS vars (`--surface-*`, `--content-*`). Light & dark share component code; only vars flip. |
| **Color is a signal** | The only chromatic colors are `status.*` accents — used exclusively for state (active/pending/error/info/idle). |
| **Border-radius harmony** | Tight, consistent radii (`rounded-lg` / `rounded-xl`) + subtle 1px borders separate modules without heavy shadows. |
| **Density over decoration** | Compact tables, small type scale, mono fonts for numerics. |
| **Keyboard-first** | Global Cmd+K command menu for navigation, deploys, and prompt search. |

---

## 2. Token Map

Defined in `apps/web/tailwind.config.ts` + `src/app/globals.css`.

```
Surfaces   surface.base / surface.raised / surface.overlay
Borders    border.subtle / border.strong
Content    content.primary / content.secondary / content.muted
Status     status.active  (green  → autonomous agent running)
           status.pending (amber  → HITL checkpoint, pulses)
           status.error   (red    → failed / aborted)
           status.info    (blue   → deploying)
           status.idle    (gray   → paused / idle)
```

The amber `status.pending` uses the `pulse-ring` keyframe — the visual heartbeat of a WhatsApp HITL pause.

---

## 3. Component Inventory

| Component | File | Role |
|---|---|---|
| `StatusDot` | `components/ui/status-dot.tsx` | The core state signal (glow/pulse per status). |
| `Card` family | `components/ui/card.tsx` | Module surface primitive. |
| `Button` | `components/ui/button.tsx` | Primary/secondary/ghost/danger. |
| `Kbd` | `components/ui/kbd.tsx` | Keyboard hint chips. |
| `CommandMenu` | `components/command-menu.tsx` | **Cmd+K** — jump to clients, trigger CI/CD, search prompts. |
| `AutonomyToggle` | `components/autonomy-toggle.tsx` | Segmented autonomy control (gates HITL). |
| `CreditMeter` | `components/credit-meter.tsx` | Credits + **margin** view (charged − cost). |
| `AgentCard` | `components/agent-card.tsx` | A single MoM agent's live state. |
| `TenantTable` | `components/tenant-table.tsx` | Super-Admin tenant roster. |
| `CheckpointQueue` | `components/checkpoint-queue.tsx` | In-app mirror of WhatsApp approvals. |
| `DeployButton` | `components/deploy-button.tsx` | Phase-2 one-button deploy trigger. |
| `StrategyChat` | `components/strategy-chat.tsx` | Client ↔ Strategist refinement chat. |
| `AppShell` | `components/app-shell.tsx` | Sidebar + top command bar. |

---

## 4. Routes

| Route | Surface |
|---|---|
| `/` | **Super-Admin Control Center** — global stats, MoM network, tenant table, credit/margin, approval queue. |
| `/clients/[slug]` | **Client Dashboard** — white-labeled; autonomy toggle, metrics, agents, credit/margin, strategy chat. |
| `/api/bff/cicd/deploy` | BFF proxy → NestJS (keeps deploy secrets off the client). |

---

## 5. Data Boundary

The frontend holds **no secrets** and never touches the database. It calls the NestJS BFF via typed routes. The scaffolding ships with `src/lib/mock-data.ts` fixtures that map 1:1 to the API contracts in `src/lib/types.ts` — swap the fixture import for a `fetch` to go live.

---

## 6. Running

```bash
cd apps/web
npm install
npm run dev      # http://localhost:3000  (set API_BASE_URL for the BFF)
```
