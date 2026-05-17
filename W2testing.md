# W2 Testing Notes

Session: 2026-05-17 skill review and level-up pass. Delete when done.

---

## What shipped this session

### New skills
| Skill | Trigger | Notes |
|-------|---------|-------|
| `incident-open` | "open an incident", "declare an incident" | Assigns INC-YYYY-NNN, staged Planner card + Teams alert draft |
| `runbook-gen` | "write a runbook for", "generate a runbook" | From scratch or rough notes; reads PS modules before writing commands |
| `user-report` | "user report for X", "what has X been doing" | 7-day activity snapshot; two paths: Aaron (full) vs other users (limited) |
| `diagram` | "diagram this", "draw this", "make an excalidraw" | General Excalidraw; color palette and layout guidelines baked in |

### Rewritten skills
| Skill | Key change |
|-------|-----------|
| `project-creator` | Full staged review: Plan → Buckets → Tasks as editable CREATE blocks before any API call. Sequential execution with edit_block cleanup. |

### Briefing skill fixes
- **Day Starter**: Monday lookback now anchors to `last_day_ender` (not fixed 72h); backup monitoring added (`ninja_list_all_backups`, stale threshold 24h)
- **Week Starter/Ender**: Wired to `System/briefing-state.md`; DM chain fixed (`teams_list_my_chats` + `teams_get_chat_messages`); Confluence CQL uses computed date; Draft Planner actions section added
- **Day Ender**: `has_pending_tasks` tracking added

### Cross-skill synergy (all skills)
- `troubleshoot` → escalation paths to `/network-troubleshooter`, `/event-log-triage`, `/incident-open`, `/tenant-forensics`
- `event-log-triage` → pivot note to `/event-log-analyzer` when user provides an exported file
- `posture-check` → per-🔴-category escalation guidance
- `access-review` → `/tenant-forensics`, `/user-report`, `/posture-check` escalation
- `scribe` `when_to_use` → redirects to `/runbook-gen` for from-scratch runbooks

### Level-up pass (14 files)
| Change | Files |
|--------|-------|
| `Read(powershell/**)` + PS consultation note | `onprem-health`, `event-log-triage`, `troubleshoot`, `network-troubleshooter`; note only in `runbook-gen` |
| Removed unused tools | `license-audit` (exo_get_mailbox, entra_get_audit_logs), `mailflow-investigation` (exo_list_accepted_domains) |
| Added missing tools | `posture-check` (admin_list_service_incidents), `tenant-forensics` (ninja_list_device_alerts), `meeting-prep` (planner_get_user_tasks) |
| `wazuh_list_agents` activated | `troubleshoot` scope table — disconnected agent = silent alerts |
| `network-troubleshooter` Step 6 | Clarified Desktop Commander runs from WSL, not remote host |
| Backup thresholds | `change-record` (24h prod / 7d non-prod + /onprem-health pre-flight for High risk), `asset-investigation` (7d stale) |
| Persistent note update | `asset-investigation` — update `date`, append `## Investigation — YYYY-MM-DD` section |
| Firecrawl fallback | `patch-campaign`, `vuln-triage` — graceful degradation when unavailable |
| Staged draft consistency | `patch-campaign`, `vuln-triage` — CREATE blocks + edit_block cleanup + `has_pending_tasks: true` |
| `has_pending_tasks: true` in frontmatter | `license-audit`, `patch-campaign`, `vuln-triage` |
| Tenant forensics | `ninja_list_device_alerts` in parallel NinjaOne block; `/access-review`, `/user-report`, `/incident-open` in Step 5 |
| Meeting prep | `planner_get_user_tasks` for Aaron's tasks; correct limitation noted for other attendees |

---

## Pre-flight checklist before testing

- [ ] `export BW_SESSION=$(bw unlock --raw)` — MCP server won't start without it
- [ ] `claude mcp list` — confirm Firecrawl, Excalidraw, Fathom server names match skill frontmatter
- [ ] Check `OpsManVault/System/briefing-state.md` exists; if not, first Day Starter creates it (all four fields should be present after first run)
- [ ] Verify WSL username in `onprem-health` / `event-log-triage` PS path (`/home/wsl_stevens/...`) matches actual username

## Skills to test first (most changed)

1. **Day Starter** — run Monday to verify `last_day_ender` anchor works; check state file written correctly
2. **project-creator** — run against a small project; verify staged build block appears, partial push works, cleanup removes blocks
3. **incident-open** — run with a test incident; verify INC numbering, staged Teams alert shows up as draft
4. **posture-check** — check all 6 categories render, escalation paths appear for any 🔴

## Known gaps (not built yet)
- No security alert triage skill (quick "is this alert real?" workflow)
- No CMMC compliance evidence gathering skill
- No IT communications / announcement skill
