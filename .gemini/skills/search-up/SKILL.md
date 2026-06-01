# Skill: Search Up (Quick Tier)

- **Author:** Gemini
- **Version:** 2.1
- **Tier:** Quick (1–3 sources, single-query)

---

## What this skill is for

Fast factual lookups where one or two well-chosen sources answer the question. The Perplexity-style "Quick" tier. If you find yourself needing to compare multiple sources or write more than three paragraphs, switch to `deep-search` instead.

Use it for:
- **API documentation** — "What's the Graph API endpoint for listing sign-in logs?"
- **Package versions** — "Latest stable version of zod? Any breaking changes from 3.x?"
- **Error messages** — "What does TS2345 'Argument of type X is not assignable to Y' mean?"
- **Syntax / how-to** — "How do I paginate Graph API results?"
- **CVE summary** — "What's CVE-2024-XXXXX about?" (public info only)
- **Image-driven identification** — paste a screenshot of a hardware tag or error dialog and ask what it is

---

## Workflow

1. **If the question is ambiguous, clarify once** (which library version, which framework, OS context). Don't loop on clarification.
2. **Run a single Google-grounded search.** Pull the top relevant results.
3. **Answer in 2–4 sentences** with the key fact up front. Add a code snippet if the question is about usage.
4. **Cite every factual claim inline** with `[N]` markers tied to the Sources list at the bottom.
5. **Finalize Sources List:** For all cited sources, you **must provide the full, direct URL.** If the search tool provides an indirect or incomplete link, you are required to perform a secondary lookup (e.g., by searching for the article title) to find and list the correct URL.
6. **Flag freshness** when relevant — "as of YYYY-MM" — because Google's index isn't always current and Gemini's training cutoff isn't either.

---

## Output format

```
[2–4 sentence answer with inline [1][2] citations]

[Optional code snippet]

**Sources**
[1] Page Title — https://full.direct/url — accessed YYYY-MM-DD
[2] Page Title — https://full.direct/url/to/page — accessed YYYY-MM-DD
```

If the answer can't be sourced (no quality result found), say so explicitly: "No authoritative source found — proceeding with model knowledge." Don't fabricate sources.

---

## Image input

Gemini handles images natively. Paste a screenshot or attach an image (`--image path/to/file.png`) alongside the question. The skill will reason over the image plus do web search for context. Use cases:
- Identify a device or hardware from a photo
- Decode an error dialog screenshot into an explanation + fix
- Look up what software UI is in a screenshot

---

## When to escalate

Switch to a deeper tier when the question grows:

- 2+ sub-questions, comparison of options, "what's the consensus on…" → `deep-search`
- Full report wanted ("write me a brief on…", "comprehensive look at…", structured deliverable) → `research`

---

## Invocation phrases

- "search-up …"
- "What's the API for …"
- "Latest version of …"
- "What does this error mean: …"

---

## Tools

- **Google Search grounding** (built-in)
- **Multimodal image input** (built-in)
- **`ask_user`** — one clarifying question max
