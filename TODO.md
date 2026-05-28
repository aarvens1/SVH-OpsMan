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
- [ ] Wikilinks pass — partial (4 daily notes wired up); meeting notes, investigation notes, and asset references still have no cross-links. Consider a `vault-audit` skill to catch this routinely.
- [ ] Naming inconsistency in `Projects/` — mixed conventions (ISO date prefix vs. no prefix, `FGT-` vs. `Fought-`). Standardize to: dated artifacts = `YYYY-MM-DD-kebab-name.md`, persistent references = `Category-Name.md`.

---

## Optional / later

- [ ] TTL cache on `ninja_list_servers` and `admin_get_service_health` — reduces repeat calls in day-starter sessions
- [ ] Shape `teams.ts` write ops — `send_message`, `create_channel`, `add_member` still return raw API responses
- [ ] Re-enable IR Triage skill — currently `SKILL.md.disabled`; re-enable once comfortable with tiered confirmation model
- [ ] `sa_stevens` / `da_stevens` non-interactive PSRemoting — add `SA_REMOTE_PASSWORD` and `DA_REMOTE_PASSWORD` to BW to enable automated skills that currently require `Get-Credential`
- [ ] Configure rclone remotes (`onedrive` and `gdrive`) — see `docs/setup/backup.md`
