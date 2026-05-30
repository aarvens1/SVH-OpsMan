# SVH OpsMan — TODO

Active tasks. This file is updated by the memory-cleanup skill.

---

## Bitwarden — add credentials for pending services

These services will fail until credentials are added to the **SVH OpsMan** BW item. See `references/credentials.md` for the exact field names and setup instructions per service.

### Have credentials, just need to add to BW
- [ ] FreshService — `FRESHSERVICE_DOMAIN` · `FRESHSERVICE_API_KEY`
- [ ] Synology — `SYNOLOGY_HOST` · `SYNOLOGY_USER` · `SYNOLOGY_PASSWORD`

### Needs setup first, then add to BW
- [ ] Google OAuth2 — create GCP OAuth2 Web app client, generate refresh token with scopes `email`, `calendar`, `drive`, `gmail.modify`, then add `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_REFRESH_TOKEN` · `GOOGLE_USER_EMAIL`
- [ ] Have I Been Pwned — subscribe at haveibeenpwned.com (paid), then add `HIBP_API_KEY`

### When ready (not urgent)
- [ ] Cloudflare — `CLOUDFLARE_API_TOKEN` (Zone:Read + Analytics:Read + Firewall:Read)
- [ ] n8n — `N8N_URL` · `N8N_API_KEY`

---

## Verify new tools end-to-end

Once BW credentials are in place, test at least one tool per service:

- [ ] `synology_storage_info` — NAS connectivity + DSM auth
- [ ] `synology_m365_backup_status` — ActiveBackup API access
- [ ] `freshservice_list_tickets` — API key and domain
- [ ] `gmail_list_recent` — Google OAuth2 refresh flow
- [ ] `gcal_list_events` — Calendar scope
- [ ] `hibp_check_account` with `astevens@shoestringvalley.com`
- [ ] `unifi_restart_device` against a non-critical test AP — verify colon MAC format in logs
- [ ] `ninja_set_maintenance_mode` on a test device — enable then immediately disable

---

## Docs — needs verification

- [x] `docs/getting_started.md` Step 3 — fixed: updated to `npm install -g @anthropic-ai/claude-code`

---

## Obsidian Vault Cleanup — from 2026-05-28 audit

Full vault review was done on 2026-05-28. Everything below came out of that session.

### Quick-win checklist (mechanical, do these first)

- [x] Add frontmatter to all 7 References files (`credentials.md`, `ps-remoting-snippets.md`, `common-failure-modes.md`, `common-event-clusters.md`, `triage-gate.md`, `hypothesis-patterns.md`, `users.md`)
- [x] Fix `skill` field on all existing notes — standardized to lowercase hyphenated across all daily briefings, meetings, and investigations
- [x] Add `attendees: [Aaron Stevens, Sam Maxon, Brian Bates, Shem Steppe]` to `Meetings/2026-05-13-rge-biweekly.md` frontmatter
- [x] Change `status: open` → `status: draft` on `Investigations/2026-05-25-fgt-disconnected-devices.md`
- [x] Promote concluded notes from `draft` → `reviewed`: cmmc-followup.md, rge-biweekly.md, 2026-05-12-BRG-Meeting.md, 2026-05-12-IT-Team-Meeting.md (credential-spray → `contained`)
- [x] Move posture snapshots out of `Briefings/Daily/` → `Investigations/2026-05-14-posture-snapshot.md` and `2026-05-16-posture-snapshot.md`
- [x] Move credential-spray to `Incidents/Active/` — added `incident_id: INC-2026-001`, `severity: high`, `status: contained`
- [x] Create missing folder stubs: `Incidents/Active/`, `Changes/`, `Assets/`, `Reviews/Access/`, `Reviews/Patches/`, `Vulnerabilities/`
- [x] Add wikilinks to `# Notes` section of daily notes (2026-05-14, 2026-05-21, 2026-05-26, 2026-05-27); updated backlinks in 2026-05-20.md
- [x] Clean up raw scratchpad in `Meetings/2026-05-19-cmmc-followup.md` — formatted as "Follow-up questions" section

### Remaining issues

- [x] Create missing folder stubs — `Incidents/Active/`, `Changes/`, `Assets/`, `Reviews/Access/`, `Reviews/Patches/`, `Vulnerabilities/` all created
- [ ] Wikilinks pass — partial (4 daily notes wired up); meeting notes all have at least one link now, but cross-links to assets/investigations are thin. Consider a `vault-audit` skill to catch this routinely.
- [x] Naming inconsistency in `Projects/` — renamed `EUG/PDX/SEA-Network-Plan-2026-05-25.md` → `2026-05-25-{site}-network-plan.md`; renamed `Fought-Network-Plan.md` → `FGT-Network-Plan.md`; updated all backlinks (2026-05-29)

---

## Optional / later

- [x] TTL cache on `ninja_list_servers` and `admin_get_service_health` — both already implemented (60s TTL, in-memory Map) as of the time this was written to TODO
- [x] Shape `teams.ts` write ops — `send_message`, `create_channel`, `add_member` now return shaped responses (id, name, webUrl only) (2026-05-29)
- [x] Re-enable IR Triage skill — already active (`SKILL.md` exists alongside old `SKILL.md.disabled` backup); DM routing validation mode in place (2026-05-29)
- [ ] `sa_stevens` / `da_stevens` non-interactive PSRemoting — add `SA_REMOTE_PASSWORD` and `DA_REMOTE_PASSWORD` to BW to enable automated skills that currently require `Get-Credential`
- [ ] Configure rclone remotes (`onedrive` and `gdrive`) — see `docs/setup/backup.md`

---

## Project workflow — remaining catch-up items (from 2026-05-29 design pass)

The project lifecycle bundle landed in `f25feea` (close skill + day-starter Projects link-back + Inbox rhythm + `project/<slug>` tag prompts). These four items came out of the same diagnostic but weren't in the bundle:

- [x] **Initiative layer decision** — shared tags, no subfolder. Initiatives are a `project/<initiative-slug>` tag shared across related project notes; Dataview surfaces them. Documented in `obsidian-output.md` vault paths table (2026-05-29).
- [x] **Skill page + PS companion audit** — script created at `scripts/audit-skills.sh`; run it to get a live gap report. Current state (2026-05-29): 28 skills missing both vault page and PS companion, 15 missing PS companion only. See audit output for the full list.
- [x] **Activity Log inclusion rule** — written into `.claude/rules/note-patterns.md` (2026-05-29)
- [x] **Handoff stale flag in day-starter** — moot: `/handoff-queue` and `/handoff-receive` are now disabled; `Handoffs/` lifecycle is retired. No stale-flag logic needed.

---

## Dev assistant routing — Gemini retirement follow-ups (from 2026-05-29 routing change)

Routing rewrite landed (Claude account 2 = Dev, Gemini = quick Google only). The handoff skills were built around Gemini's async cycle — they need a rethink now that Dev work is interactive in a second Claude session.

- [x] **Rename `/gemini-handoff` → `/code-handoff`** — done (2026-05-29). Dir renamed, SKILL.md rewritten with new name/triggers/allowed-tools, docs updated. Handoffs/ vault path kept.
- [x] **Retire `/handoff-queue` and `/handoff-receive`** — both disabled (`SKILL.md.disabled`) as of 2026-05-29. Gemini async cycle is retired; these skills have no equivalent need with interactive Claude Dev. `Handoffs/` folder and any existing notes can be archived when ready.
- [x] **Prune retired Gemini dev skills from `.gemini/skills/`** — deleted 17 dirs: api-spec, claude-handoff, code-documenter, code-reviewer, config-validator, create-collector-job, db-query, dependency-manager, git-helper, log-analyzer, npm-audit, refactor-powershell, release-drafter, shell-script-converter, test-writer, test-writer-mcp-server, ts-linter. Remaining: deep-search, research, web-research, pdx-pinball, pdx-weekend-digest (2026-05-29).

---

## WT workspace launch — finish setup (from 2026-05-29 fix session)

Root cause fixed (zsh -lc skips .zshrc → added ~/.zprofile), 5-tab launcher created. Three manual steps still needed:

- [x] **Restart Windows Terminal** — done
- [x] **Run `dotfiles/install-windows.ps1`** — done; Start Menu shortcut created
- [ ] **Remap Copilot key** — PowerToys → Keyboard Manager → Remap a shortcut → Source: Copilot Key → Target: Run Application → `%APPDATA%\Microsoft\Windows\Start Menu\Programs\SVH OpsMan.lnk`
