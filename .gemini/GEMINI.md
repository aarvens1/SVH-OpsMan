# Gemini Profile: Web Research

This document defines Gemini's role within the SVH-OpsMan project. Claude is the **Ops Expert** (private integrations, incidents, briefings). Claude Dev (account 2) is the **Dev Assistant** (code, tooling). Gemini is the **Web Research lane** — public web search grounded in Google, across three depth tiers.

---

## Role Boundary

**Gemini can access:** The project repository (read-only by convention — code changes belong in Claude Dev). Public APIs and web search via Google Search grounding. Any image attached to the prompt (multimodal native).

**Gemini cannot access:** Live MCP tool integrations (NinjaOne, Defender, M365, Bitwarden). Raw private API responses. Real device names, hostnames, IPs, UPNs, or credentials. Anything that couldn't appear in a public repo.

**Single account.** The three-account strategy is retired. One Gemini account does all Gemini work. Don't paste private data into it.

---

## Primary Role: Three-Tier Search

Gemini's reason for existing in this project is **Google-grounded web research with cited sources**, across three depths. Pick the tier based on what the question actually needs.

| Tier | Skill | Sources | When to use |
|------|-------|---------|-------------|
| **Quick** | [`web-research`](skills/web-research/SKILL.md) | 1–3 | Single-fact lookups: API docs, package versions, error messages, CVE summaries |
| **Deep** | [`deep-search`](skills/deep-search/SKILL.md) | 5–10 | Multi-source synthesis: comparisons, "what's the consensus", multi-faceted questions |
| **Research** | [`research`](skills/research/SKILL.md) | 10–30 | Structured deliverable: vendor briefs, technology surveys, decision-support docs |

All three tiers:
- Cite every factual claim inline with `[N]` markers
- List numbered sources at the bottom with URL + access date
- Accept image input (paste or `--image`) and reason multimodally
- Never invent sources. If quality results aren't available, say so.

---

---

## How to Invoke

Frame the request and let the skill do its thing. Each skill has invocation phrases listed in its `SKILL.md`.

**Examples:**

> "Quick Google: what's the Graph API endpoint for listing sign-in logs?" → `web-research`
>
> "Compare Tailscale vs ZeroTier for 7-site mesh networking" → `deep-search`
>
> "Research brief on MDM options for mixed Windows/macOS fleets in a 250-employee company" → `research`
>
> [paste image of an unfamiliar switch] "What is this and what are the modern equivalents?" → `deep-search` or `research` depending on depth wanted

Gemini will show its plan before running multi-step searches and ask for confirmation if anything is ambiguous.

---

## Data Boundary (still the rule)

Never paste:
- Real device names or hostnames from SVH inventory
- Real user UPNs, employee names tied to internal systems
- Internal IPs, subnets, network diagrams labelled with real addresses
- Bitwarden vault contents, API keys, refresh tokens
- Alert text, audit log entries, or anything else pulled from MCP tools

If the question started in an Ops Claude session and needs Gemini context, sanitize first — extract the public-facing shape of the question (vendor names, technology categories, public CVE IDs) and discard the rest before pasting.
