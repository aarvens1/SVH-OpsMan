---
name: pdx-weekend-digest
description: Curated digest of Portland-area weekend events for a 3-year-old. Researches pdxparent.com, Red Tricycle, OMSI, Oregon Zoo, Multnomah Library, and other family sources. Delivers 5–8 picks with times, location, cost, and a Top Pick. Output is to stdout for pasting into a Claude session and saving to vault. Trigger phrases: "pdx weekend", "portland toddler events", "what can we do this weekend", "weekend events for [kid/toddler]".
---

# Skill: PDX Weekend Digest (Portland Toddler Events)

Build a curated digest of the best upcoming weekend events in the Portland, Oregon metro area for a 3-year-old child.

**Objective:** Help Aaron decide what to do with his kid this coming Saturday and Sunday.

---

## Steps

1. **Determine the date range.** "Upcoming weekend" = the Saturday and Sunday immediately following today. If today is already the weekend, target the next full weekend. Confirm today's date first.

2. **Primary source — pdxparent.com:**
   - Fetch https://pdxparent.com/calendar/ or their current "Best Things to Do This Weekend" post
   - Also try https://pdxparent.com/things-to-do-weekend/ and the site homepage for a current weekend roundup link

3. **Supplement with these Portland family sources:**
   - https://www.travelportland.com (family section)
   - https://www.redtri.com/portland/
   - https://www.pdxkidscalendar.com
   - Oregon Zoo, OMSI, Portland Children's Museum, Lan Su Chinese Garden, Oaks Amusement Park event pages
   - Multnomah County Library storytimes for target Sat/Sun

4. **Filter for a 3-year-old.** Prioritize:
   - Hands-on / sensory / movement-based (storytimes, animals, trains, water/sand, simple crafts)
   - Short duration (≤ 90 min), stroller-accessible, restrooms nearby
   - Free or low-cost — flag the price
   - Outdoor picks with weather check; indoor backups
   - Avoid: explicitly 5+, loud concerts, long ticketed shows

5. **Build the digest.** Pick the 5–8 best options. For each:
   - Name, day + time, location (neighborhood + address), cost, source URL
   - One sentence on why it works for a 3-year-old

   Group by day (Saturday first). Add a **Top Pick** callout at the top. If weather matters, note the Portland weekend forecast (quick search).

6. **Output the formatted note to stdout** using this structure:

```
---
date: YYYY-MM-DD
skill: pdx-weekend-digest
status: draft
tags: [weekend, portland, toddler, family]
---

# PDX Toddler Weekend — [Sat date] / [Sun date]

> [!tip] Top Pick: [Event name]
> [One-line reason it's the best pick]

## Saturday, [Month Day]
...

## Sunday, [Month Day]
...
```

Then add:
> **→ Paste this into a Claude Ops session and run `/import-research` to file it under `Research/YYYY-MM-DD-pdx-toddler.md`.**

---

## Constraints

- Portland, OR metro (Beaverton, Hillsboro, Lake Oswego, and Vancouver WA only if exceptional)
- 5 great picks beats 12 mediocre ones
- If a source doesn't load or dates can't be confirmed, say so — don't fabricate
