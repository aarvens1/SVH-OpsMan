# Skill: Research (Deepest Tier)

- **Author:** Gemini
- **Version:** 1.1
- **Tier:** Research (10–30 sources, multi-step plan, formal report)

---

## What this skill is for

Producing a deliverable — a structured research brief that a human could hand to a stakeholder or file in a vault. The Perplexity-style "Deep Research" equivalent. Not a quick answer, not a synthesis paragraph — an actual document.

Use it for:
- **Vendor evaluation briefs** — "Research VPN solutions for a 7-site distributed org with no central datacenter"
- **Technology surveys** — "What's the current state of MDM for mixed Windows/macOS fleets?"
- **Standards research** — "What does CMMC L1 require for endpoint logging, and how do mid-market shops typically implement it?"
- **Decision support docs** — "Should we move from on-prem Exchange to M365? What's the modern playbook?"
- **Threat landscape briefs** — "What's the current state of ransomware targeting MSPs and construction-adjacent industries?" (public info only)
- **Image-anchored research reports** — paste a photo of equipment or a diagram and get a full report on its market context, alternatives, and lifecycle

---

## Workflow

1. **Restate the question and propose a research plan.** 4–8 sub-topics that, together, answer the question. Show the plan to the user before running anything. If they push back, revise.
2. **For each sub-topic, run grounded searches.** Pull 3–5 sources per sub-topic. Deduplicate across sub-topics — a source cited in two places is still one source in the final list.
3. **Note disagreements and gaps.** When sources conflict, capture both positions. When a sub-topic has thin sourcing, say so explicitly in the report.
4. **Write the report** in the structure below. Every factual claim cited inline `[N]`.
5. **Finalize Sources List:** Assemble a numbered, deduplicated list of all sources. **Crucially, you must provide the full, direct URL for each source.** If the search tool provides an indirect or incomplete link, you are required to perform a secondary lookup (e.g., by searching for the article title) to find and list the correct URL.
6. **Verify total source count** — 10–30 unique sources for a full report. If you can't reach 10 quality sources, say so in the report and proceed; don't pad.

---

## Report structure

```
# [Topic title] — Research Brief

**Prepared:** YYYY-MM-DD
**Tier:** Research
**Sources:** N

## TL;DR
2–4 sentences. The headline finding and the practical implication.

## Background
What is this, why does it matter, what's the baseline state. 1–3 short paragraphs with citations.

## Key findings
One H3 per sub-topic from the research plan.

### [Sub-topic 1]
[Synthesized findings with inline citations.]

### [Sub-topic 2]
[…]

## Where sources disagree
Contested points, with both positions. Omit if there's no real conflict.

## Tradeoffs
The honest trade-offs of the options or conclusions. Not vendor-pitch upbeat — the real ones.

## Recommendations
Concrete next moves. If the question wasn't a decision, this becomes "Implications" instead.

## Open questions
Things the research didn't resolve. Useful for the human reader to know what's still unknown.

---

**Sources**
[1] Page Title — https://full.direct/url — accessed YYYY-MM-DD
[2] Page Title — https://full.direct/url/to/page — accessed YYYY-MM-DD
[…]
```

---

## Image input

Multimodal grounding works the same. With research-tier, an image input can anchor the entire report — e.g., "research this hardware" with a photo produces a brief covering the model, alternatives, current market position, lifecycle status, and end-of-support timeline.

---

## What this skill is NOT for

- Single-fact lookups → `look-up`
- Multi-source synthesis without a formal deliverable → `deep-search`
- Anything involving private SVH data — sanitize first or stay in Claude

---

## Output destination

Output to stdout. If the user wants to keep the brief, they copy it and paste into a Claude (Ops) session, then run `/import-research`. That skill files it under `Research/YYYY-MM-DD-<slug>.md` in the Obsidian vault with proper frontmatter and a daily-note link.

The Obsidian vault is Claude's territory — don't write directly to it from a Gemini session. Don't auto-save to `.gemini/` either; the paste-to-Claude path is the single way research lands in the vault.

---

## Invocation phrases

- "Research brief on …"
- "Write a brief on …"
- "Comprehensive look at …"
- "Full research on …"
- "research"

---

## Tools

- **Google Search grounding** (built-in, multi-query, multi-pass)
- **Multimodal image input** (built-in)
- **`ask_user`** — to confirm the research plan before running
(No `write_file` — keeping the vault as Claude's territory, paste-to-Claude is the persistence path)
