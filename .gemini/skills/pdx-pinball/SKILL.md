---
name: pdx-pinball
description: PDX pinball scene digest — upcoming tournaments, league nights, new machine placements, and changes from Portland-area venues and the Pinball PDX Discord. Trigger phrases: "pdx pinball", "pinball events", "what's new in pinball", "pinball this week".
---

# Skill: PDX Pinball Digest

**⚠️ STATUS: Scaffold — Discord MCP not yet connected.**

This skill is ready to run once the Discord MCP server is configured on the Gemini account. See the setup note at the bottom.

---

## What this covers

- Upcoming PDX-area pinball tournaments and league nights
- New machine arrivals and removals at local venues
- Notable discussion from the Pinball PDX Discord (and any other pinball channels)
- Quick machine location reference via pinballmap.com

---

## Steps (when Discord MCP is active)

1. **Check Discord channels via MCP:**
   - Target: `#announcements`, `#tournaments`, `#machines`, `#events` (or equivalent) in the Pinball PDX server
   - Also check any other configured pinball channels
   - Time window: last 7 days for tournaments/events; last 14 days for machine changes

2. **Cross-reference pinballmap.com** for current machine locations at key venues:
   - Ground Kontrol (downtown PDX) — https://pinballmap.com/map?address=portland
   - YardHouse, Reel M Inn, Dots Café, Barcade / local spots
   - API endpoint: `https://pinballmap.com/api/v1/locations.json?by_city_id=303` (Portland)

3. **Check web sources for upcoming tournaments:**
   - https://pinballmap.com/portland/tournaments
   - IFPA Oregon calendar: https://www.ifpapinball.com/calendar/ (filter Oregon)
   - Quick search: "Portland pinball tournament [month year]"

4. **Build the digest:**
   - Section 1: **Upcoming events** (tournaments + league nights) — name, date, venue, entry fee, format
   - Section 2: **Machine news** — new arrivals, removals, notable location changes
   - Section 3: **Discord highlights** — anything interesting from the channels that doesn't fit above

5. **Output to stdout.** Suggested format:
```
# PDX Pinball — [Date range]

## Upcoming Events
...

## Machine News
...

## From the Discord
...
```

---

## Discord MCP Setup (one-time, on Gemini account)

The Gemini CLI supports MCP servers via `gemini mcp add`. To connect to Discord:

1. Install a Discord MCP server — recommended: `mcp-server-discord` from npm or a self-hosted option
2. Get a Discord bot token with read permissions on the target servers/channels
3. Register it: `gemini mcp add discord --command "npx mcp-server-discord" --env DISCORD_TOKEN=<token>`
4. Test: `gemini mcp list`

The bot needs to be invited to the Pinball PDX Discord (and any other servers) with `Read Message History` and `Read Messages` permissions. No write permissions needed.

**Alternative without Discord MCP:** Use web scraping / Google Search to find recent PDX pinball news. Won't get private Discord channel content, but covers public tournament announcements and venue pages. Remove the Discord step above and rely on steps 2 and 3 only.
