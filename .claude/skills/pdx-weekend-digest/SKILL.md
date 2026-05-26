---
name: pdx-weekend-digest
description: Curated digest of Portland-area weekend events suitable for a 3-year-old. Researches pdxparent.com, Red Tricycle, OMSI, Oregon Zoo, Multnomah Library, and other family resources. Delivers 5–8 vetted picks grouped by day with times, location, cost, and a Top Pick callout. Output saved to Obsidian vault.
trigger: "pdx weekend", "portland toddler events", "what can we do this weekend", "weekend events for [kid/toddler]"
---

Build a curated digest of the best upcoming weekend events in the Portland, Oregon area that are suitable for a 3-year-old child.

Objective: Help Aaron decide what to do with his 3-year-old this coming Saturday and Sunday.

## Steps

1. **Determine the date range.** "Upcoming weekend" means the Saturday and Sunday immediately following today. If today is a Friday, Saturday, or Sunday, still target the very next Sat/Sun (the weekend that hasn't happened yet or is currently in progress). Use bash `date` to confirm today's date.

2. **Primary source — pdxparent.com:**
   - Use WebFetch to load https://pdxparent.com and look for their weekend events / event calendar / "things to do this weekend" listings.
   - Common URLs to try: https://pdxparent.com/calendar/, https://pdxparent.com/category/things-to-do/, https://pdxparent.com/things-to-do-weekend/
   - If the homepage links to a current "Best Things to Do This Weekend in Portland with Kids" post, fetch that post directly.

3. **Supplement with other Portland family resources.** Use WebSearch and WebFetch for:
   - https://www.travelportland.com (events / family section)
   - https://www.redtri.com/portland/ (Red Tricycle Portland)
   - https://www.pdxkidscalendar.com
   - https://www.portlandfamily.com
   - Oregon Zoo, OMSI, Portland Children's Museum / Portland Playhouse, Lan Su Chinese Garden, World Forestry Center, Oaks Amusement Park calendars
   - Multnomah County Library storytimes and community center events for the target Sat/Sun

4. **Filter ruthlessly for a 3-year-old.** Prioritize:
   - Hands-on, sensory, or movement-based activities (storytimes, music, animals, trains, water/sand play, simple crafts)
   - Short duration (under ~90 min) and toddler-friendly logistics (stroller access, restrooms, food nearby, free or cheap parking)
   - Free or low-cost when possible; flag the price
   - Outdoor options in good weather and indoor backups
   - Avoid: events explicitly marked 5+, school-age, or adult-oriented; loud concerts; long ticketed shows

5. **Build the digest.** Pick the 5–8 best options across both Saturday and Sunday. For each event include:
   - Name
   - Day + start/end time
   - Location (neighborhood + address)
   - Cost / ticketing notes
   - One-sentence "why it's great for a 3-year-old"
   - Source URL

   Group by day (Saturday first, then Sunday). Add a short "Top Pick" callout at the top — the single best option of the weekend, with a one-line reason. If weather will materially affect outdoor picks, briefly note the forecast (use a quick web search for "Portland OR weekend forecast").

6. **Save to Obsidian.** Write the digest to the vault:
   - Path: `Briefings/Weekend/YYYY-MM-DD-pdx-toddler.md` (date = upcoming Saturday)
   - Frontmatter:
     ```yaml
     ---
     date: YYYY-MM-DD
     skill: pdx-weekend-digest
     status: draft
     tags: [weekend, portland, toddler, family]
     ---
     ```
   - Use the standard Obsidian MCP write tool.

7. **Summarize in chat.** Two to three sentences naming the Top Pick, the dates covered, and where the note was saved.

## Constraints

- Portland, Oregon metro area (including close-in suburbs: Beaverton, Hillsboro, Lake Oswego, Vancouver WA if notable)
- Be honest about uncertainty: if a source doesn't load or events for the date can't be confirmed, say so rather than fabricating
- Prefer quality over quantity — 5 great picks beats 12 mediocre ones
- Keep the chat response short; the Obsidian note is where the detail lives
