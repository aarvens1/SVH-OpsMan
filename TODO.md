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

## Obsidian Vault Cleanup — from 2026-05-28 audit

Full vault review was done on 2026-05-28. Everything below came out of that session.

### How to access vault files

Google Drive, account: astevens2694@gmail.com — root folder **OpsManVault** (ID: `1NFNfhVtiqwLiep2sxiWsGHv7Gdq0bzQf`). Use `download_file_content` with a file ID to read markdown (base64-encoded). Use `search_files` with `parentId = '<id>'` to list a folder.

| Folder | Drive ID |
|---|---|
| Briefings/Daily | `1C_MzFK6mMV5NzLG2zFSQpgCriYpa-kcE` |
| Briefings/Weekly | `1tG_wpNbGntRTHN763cWBLu55hEYxSqq0` |
| Investigations | `1_-I2WIdqPmrlL5mYANvKJ7R5zenzELkF` |
| Meetings | `1ZQY8NdtLzo7L9GUsXm3xR0yaJU8YD7US` |
| Projects | `1ZjxhRdA2nzlExHSzoNFFo5FDJc0mzWta` |
| Diagrams | `1FumwH2VVlgK6RJCAvkZPw3ycJ2trBT9r` |
| References | `1OUFWxv-CD02mxgNtD6sLSyo2t0FfZdB4` |
| Templates | `1RHjAi2BfiuvQRZ0sg-VHEjeqDK4VYOLj` |
| System | `11Xfv5WMeBoEAVhAgwUkP_iQeV4quG3nI` |

### Quick-win checklist (mechanical, do these first)

- [ ] Add frontmatter to all 7 References files (`credentials.md`, `ps-remoting-snippets.md`, `common-failure-modes.md`, `common-event-clusters.md`, `triage-gate.md`, `hypothesis-patterns.md`, `users.md`) — minimum: `date`, `skill: reference`, `status: draft`, `tags`
- [ ] Fix `skill` field on all existing notes — standardize to lowercase hyphenated (e.g. `Day Starter` → `day-starter`, `Meeting Prep` → `meeting-prep`, `Investigation` → `tenant-forensics`, `meeting-notes` → `scribe`, `manual` → `handoff`, `Security Posture Snapshot` → `posture-check`, `Network Segmentation` → `network-troubleshooter`)
- [ ] Add `attendees: [Aaron Stevens, Sam Maxon, Brian Bates, Shem Steppe]` to `Meetings/2026-05-13-rge-biweekly.md` frontmatter
- [ ] Change `status: open` → `status: draft` on `Investigations/2026-05-25-fgt-disconnected-devices.md` (`open` is an Incidents value, not Investigations)
- [ ] Promote concluded notes from `draft` → `reviewed`: credential-spray-andersen-asi.md, cmmc-followup.md, rge-biweekly.md, 2026-05-12-BRG-Meeting.md, 2026-05-12-IT-Team-Meeting.md
- [ ] Move `Briefings/Daily/2026-05-16-posture.md` and `2026-05-14-posture.md` out — they're posture snapshots, not daily notes; move to `Investigations/` or a `Posture/` folder
- [ ] Convert `Investigations/2026-05-20-credential-spray-andersen-asi.md` to `Incidents/Active/2026-05-20-credential-spray-andersen-asi.md` — add `incident_id`, `severity: high`, `status: open` to frontmatter
- [ ] Create missing folder stubs: `Incidents/Active/`, `Changes/`, `Assets/`, `Reviews/Access/`, `Reviews/Patches/`, `Vulnerabilities/`
- [ ] Add wikilinks to the `# Notes` section of each daily note for any investigations/meetings that happened that day (currently empty on all notes)
- [ ] Clean up raw scratchpad at bottom of `Meetings/2026-05-19-cmmc-followup.md` — the "Aaron follow up" section with unformatted questions

### Bigger issues (backlinks)

The vault has essentially zero `[[wikilinks]]`. The daily note is supposed to be an index — it isn't. Every active investigation/incident referenced in a daily note should appear in `# Notes` as `→ [[Investigations/filename]]`. Weekly notes should link to daily notes. Meeting notes should link to prior meetings they reference. This is the core navigation mechanism and it's completely unused across the whole vault.

### Missing folders (none of these exist)

`Incidents/Active/`, `Changes/`, `Assets/`, `Reviews/Access/`, `Reviews/Patches/`, `Vulnerabilities/` — all required by the vault spec, all missing.

### Naming inconsistency in Projects/

Mixed conventions — some files have ISO date prefixes, some don't, some use `FGT-` prefix, some use `Fought-`, some use site abbreviations. Standardize to: dated artifacts = `YYYY-MM-DD-kebab-name.md`, persistent references = `Category-Name.md`.

---

## Optional / later

- [ ] TTL cache on `ninja_list_servers` and `admin_get_service_health` — reduces repeat calls in day-starter sessions
- [ ] Shape `teams.ts` write ops — `send_message`, `create_channel`, `add_member` still return raw API responses
- [ ] Re-enable IR Triage skill — currently `SKILL.md.disabled`; re-enable once comfortable with tiered confirmation model
- [ ] `sa_stevens` / `da_stevens` non-interactive PSRemoting — add `SA_REMOTE_PASSWORD` and `DA_REMOTE_PASSWORD` to BW to enable automated skills that currently require `Get-Credential`
- [ ] Configure rclone remotes (`onedrive` and `gdrive`) — see `docs/setup/backup.md`
