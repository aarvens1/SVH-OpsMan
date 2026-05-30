---
name: look-up
description: Super quick answer with no fluff. Single search, direct answer.
---

# Skill: Look Up (Instant Tier)

- **Author:** Gemini
- **Version:** 1.0
- **Tier:** Instant

---

## What this skill is for

A super quick, no-fluff answer to a simple question. It provides a direct, one-sentence response with no additional formatting, citations, or explanations.

Use it for:
- "What is the capital of France?"
- "How many feet are in a mile?"
- "/look-up the atomic weight of Gold"

---

## Workflow

1. **Run a single Google-grounded search.**
2. **Provide a direct, one-sentence answer.**
3. **Do not include sources, code snippets, or any extra formatting.**

---

## Output format

```
[One sentence direct answer.]
```

---

## When to escalate

If the question cannot be answered in a single sentence, or requires any context or explanation, use `search-up` instead.

---

## Invocation phrases

- "/look-up …"
- "look-up …"
- "quick lookup …"

---

## Tools

- **Google Search grounding** (built-in)
