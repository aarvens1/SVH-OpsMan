---
name: deep-search
description: Multi-source synthesis with Google Search grounding. 5–10 sources, 3–5 sub-queries, structured response with section headings. Use for comparisons, "what's the consensus on X", multi-faceted questions.
---

# Skill: Deep Search (Middle Tier)

- **Author:** Gemini
- **Version:** 1.0
- **Tier:** Deep (5–10 sources, 3–5 sub-queries, structured response)

---

## What this skill is for

Questions that need more than one source to answer properly — comparisons, consensus checks, multi-faceted topics. The Perplexity-style "Pro Search" tier: broader than a quick lookup, but not the full structured report that `research` produces.

Use it for:
- **Vendor or tool comparisons** — "How does Tailscale compare to ZeroTier for site-to-site VPN?"
- **Consensus checks** — "What's the current consensus on running NAT64 in enterprise networks?"
- **Multi-faceted technology questions** — "What are the trade-offs of moving from Hyper-V to Proxmox for a 12-VM environment?"
- **Best-practice surveys** — "What's the modern recommendation for handling secrets in Node.js services?"
- **Threat intel summaries** — "What's known about the recent uptick in [malware family] activity?" (public info only)
- **Image-grounded multi-source research** — paste a photo of a piece of hardware and get a sourced comparison of its market position, alternatives, support state

---

## Workflow

1. **Restate the question** in one sentence to confirm scope. If it's actually a quick lookup, downgrade to `look-up` and tell the user.
2. **Decompose into 3–5 sub-queries.** Show them to the user before running. Adjust if asked.
3. **Run each sub-query with Google grounding.** Capture the top 2–3 sources per query. Aim for 5–10 total unique sources.
4. **Synthesize across sources.** Don't just summarize each one — combine facts, note where sources agree and where they conflict.
5. **Write the response** with H2 section headings. Cite every factual claim inline with `[N]`.
6. **Sources list at the end** — numbered, deduplicated, with access date.

---

## Output format

```
**TL;DR** — 2–3 sentences capturing the headline answer.

## [Section heading per facet]

[Synthesis with inline citations [1][3][5]. When sources disagree, flag it: "Source [3] argues X, but [5] notes Y."]

## [Next facet]

[…]

## Where sources disagree
[If applicable — short callout of contested points.]

## Bottom line
[2–4 sentences: the synthesized recommendation or conclusion.]

---

**Sources**
[1] Page Title — https://example.com/path — accessed YYYY-MM-DD
[2] Page Title — https://example.com/path — accessed YYYY-MM-DD
[…]
```

If fewer than 5 quality sources can be found, say so and proceed with what's available. Don't pad with low-quality citations to hit a count.

---

## Image input

Same multimodal support as `look-up` — paste an image and ask. With deep-search, image content can seed multiple sub-queries (e.g. "what is this device" + "what alternatives exist" + "what's its support state").

---

## When to escalate

Switch to `research` when:
- The deliverable needs a structured report (TL;DR, Background, Findings by area, Recommendations) rather than a synthesized answer
- 10+ sources are warranted
- Sections need explicit Background and Recommendations parts, not just facets

Switch back to `look-up` when:
- After restating, the question turns out to need only one source

---

## Invocation phrases

- "Deep search: …"
- "Compare X vs Y"
- "What's the consensus on …"
- "Survey the options for …"
- "deep-search"

---

## Tools

- **Google Search grounding** (built-in, multi-query)
- **Multimodal image input** (built-in)
- **`ask_user`** — to adjust sub-queries before running
