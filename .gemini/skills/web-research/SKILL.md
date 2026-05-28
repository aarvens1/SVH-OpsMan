---
name: web-research
description: Quick public web lookups using Google Search grounding. The go-to for API docs, package versions, error messages, and technology questions.
---

# Skill: Web Research

- **Author:** Gemini
- **Version:** 1.0
- **Account:** Research (Account C)
- **Description:** Quick public web lookups using Google Search grounding. The go-to for API docs, package versions, error messages, and technology questions.

---

## Capabilities

Gemini's built-in Google Search grounding makes it the natural CLI choice for any public web lookup. This skill covers:

- **API documentation**: "What's the NinjaOne API endpoint for listing devices?"
- **Package lookups**: "What's the latest stable version of zod? Any breaking changes from 3.x?"
- **Error messages**: "What does TS2345 'Argument of type X is not assignable to Y' mean?"
- **Technology questions**: "How does vitest handle module mocking compared to jest?"
- **CVE lookups**: "What's the severity and patch status for CVE-2024-XXXXX?" (public info only — no internal system context)
- **Syntax / how-to**: "How do I paginate results with the Microsoft Graph API?"

**This is Account C's primary function.** Use this account for research that doesn't need codebase context — keep Account A's context clean for active dev work.

---

## Primary Workflow

1. **Clarify the question** if it's ambiguous (what library version? what framework?).
2. **Search using Google grounding** — cite the source so the user can verify.
3. **Synthesize the answer** in 2–4 sentences with the key fact up front.
4. **Provide a code snippet** if the question is about usage or syntax.
5. **Flag if the answer is time-sensitive** (e.g. "as of May 2026, latest stable is...").

---

## What this skill is NOT for

- Querying internal systems or private data — that's Claude with MCP tools
- Large codebase analysis — use Account B (Docs) with `log-analyzer` or `code-documenter`
- Multi-step dev tasks — use Account A (Dev)

---

## Invocation Phrases

- "Quick Google: ..."
- "Look up ..."
- "What's the API for ..."
- "Latest version of ..."
- "What does this error mean: ..."
- "web-research"

---

## Tools

- **Google Search grounding** (built-in)
- **`ask_user`**: To clarify the scope of the question.
