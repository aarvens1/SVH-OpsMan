# SVH OpsMan — TODO

Active tasks. This file is updated by the memory-cleanup skill.

---

## Day Starter skill — cleanup items

- [ ] **Remove Personal section** from `day-starter/SKILL.md` — Google tools never configured; section is always empty and generates a data gap warning every run. Just rip it out entirely (lines 385–395 roughly; the `### Personal` section and the `Also run in parallel for the personal digest:` block in Step 2 lines 129–132).
- [ ] **Remove self-chat boilerplate** from `day-starter/SKILL.md` — replace the end of the DMs bullet (line 125) with: `Skip self-chat threads silently (they return HTTP 404 via application auth).`
- [ ] **Add IT Team channels** to day-starter monitoring (currently only checks General, Changes, Infrastructure, Alerts). Add:
  - Fought: `19:41e99a0050824d7e93ae05bef7015382@thread.skype`
  - Washington: `19:8fe01cf4269b40ed96f3ec94f2f6faae@thread.skype`
  - SYLO: `19:748dfa957021491da3b10b89a89be9d8@thread.skype`
  - Oregon: `19:b38cd0ba8a1c4a268a3fdd53444373c2@thread.skype`
  - Support: `19:dc43e0e10f5e4e8da22b02a561389369@thread.skype` *(high-volume helpdesk — Aaron explicitly wants this monitored)*
- [ ] **Add System Monitor team channels** to day-starter monitoring (team_id: `bc9d02e3-b6ae-4b02-9e4f-c3963f928fe4`). All channels are automated alert feeds:
  - Server Alerts: `19:0aad79fd5d0e41aa8b4665f1b09753d8@thread.tacv2` — monitoring sources
  - Ninja Backup Alerts: `19:524829f2ee1d4008bff053448e94eaec@thread.tacv2`
  - Entra Cert Alerts: `19:8149a7e139d4424cb6a368460fdeed70@thread.tacv2`
  - Microsoft Alerts: `19:926bb440dc354c77a28b1f78726b428b@thread.tacv2` — Defender + M365
  - SSL Cert Alerts: `19:0430fe9af28d4beab1d774805a231ad3@thread.tacv2` — haveibeenexpired.com
  - Unifi Alerts: `19:4477833c038d4a3296c0aee779efe641@thread.tacv2`
  - Backup Alerts: `19:c8fde96a81394fa9b20d70a981ce0452@thread.tacv2` — Cloudberry (legacy, may be stale)
  - General: `19:SUF0pCKJgaU0uEH9u-22P9hAWu16JWk4XxlIH7xQvkQ1@thread.tacv2`
- [ ] **Service Bot chat** — not found in `teams_list_my_chats` results. Clarify with Aaron what this is (helpdesk bot? specific app?) and get the chat/channel ID.
- [ ] **Replace dynamic channel discovery with a static list** — remove the `teams_list_teams` → `teams_list_channels` discovery steps from the skill. Instead, read a fixed list of `{team_id, channel_id, name}` entries from `config.yaml` and call `teams_list_messages` directly on each. Put the channel list in `config.yaml` under `teams.channels` so IDs can be updated without touching the skill file. This saves 2 API calls per run and makes the monitored set explicit and intentional.

All edits require `opsman-dev` mode (skills dir is blocked in `opsman`).

---

## Bitwarden — add credentials for pending services

These services will fail until credentials are added to the **SVH OpsMan** BW item. See `references/credentials.md` for the exact field names and setup instructions per service.

### Needs setup first, then add to BW
- [ ] Google OAuth2 — create GCP OAuth2 Web app client, generate refresh token with scopes `email`, `calendar`, `drive`, `gmail.modify`, then add `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_REFRESH_TOKEN` · `GOOGLE_USER_EMAIL`
- [ ] Have I Been Pwned — subscribe at haveibeenpwned.com (paid), then add `HIBP_API_KEY`

### When ready (not urgent)
- [ ] n8n — `N8N_URL` · `N8N_API_KEY`

---

## Verify new tools end-to-end

Once BW credentials are in place, test at least one tool per service:

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
- [x] `sa_stevens` non-interactive PSRemoting — `SA_REMOTE_PASSWORD` added to BW (2026-05-30)
- [ ] `da_stevens` non-interactive PSRemoting — deferred; DA credential automation is on hold for now
- [x] Configure rclone remotes (`onedrive` and `gdrive`) — both configured and working (2026-05-30)

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
- [x] **Prune retired Gemini dev skills from `.gemini/skills/`** — deleted 17 dirs: api-spec, claude-handoff, code-documenter, code-reviewer, config-validator, create-collector-job, db-query, dependency-manager, git-helper, log-analyzer, npm-audit, refactor-powershell, release-drafter, shell-script-converter, test-writer, test-writer-mcp-server, ts-linter. Remaining: look-up, search-up, deep-search, research, pdx-pinball, pdx-weekend-digest (web-research renamed → search-up; look-up added as Instant tier).

---

## WT workspace launch — finish setup (from 2026-05-29 fix session)

Root cause fixed (zsh -lc skips .zshrc → added ~/.zprofile), 5-tab launcher created. Three manual steps still needed:

- [x] **Restart Windows Terminal** — done
- [x] **Run `dotfiles/install-windows.ps1`** — done; Start Menu shortcut created
- [ ] **Remap Copilot key** — PowerToys → Keyboard Manager → Remap a shortcut → Source: Copilot Key → Target: Run Application → `%APPDATA%\Microsoft\Windows\Start Menu\Programs\SVH OpsMan.lnk`
- [ ] **4-pane layout option** — Aaron asked 2026-05-26 about a 2×2 pane layout with specific connections. Pattern: `wt --profile "P1" ; split-pane -V --profile "P2" ; move-focus left ; split-pane -H --profile "P3" ; move-focus right ; split-pane -H --profile "P4"`. May be superseded by the 5-tab launcher — confirm with Aaron.

---

## iOS remote terminal access to OpsMan

Goal: SSH into WSL from iOS for interactive OpsMan sessions. Blink Shell preferred over ServerCat.

- [ ] Install Tailscale on Windows (covers WSL2 automatically) + iOS — 10 min setup, no open ports
- [ ] Install Blink Shell on iOS (not ServerCat)
- [ ] Configure tmux persistent session on WSL so BW_SESSION survives detach/reattach
- [ ] Test: connect via Blink → attach tmux → run `opsman` → verify MCP tools live

Note: Teams push notifications (async results) still complement this — terminal is for interactive sessions, Teams/email for background job completion.

---

## Memory-extracted TODOs (from memory-cleanup 2026-05-31)

---

## S2D / Cluster tooling — from MSDisk audit (2026-06-02)

- [ ] **`/cluster-health` skill** — S2D cluster snapshot: `Get-Cluster`, `Get-ClusterNode`, `Get-ClusterSharedVolume`, `Get-StoragePool`, `Get-VirtualDisk`, `Get-PhysicalDisk`, `Get-ClusterNetwork`. Writes an Infrastructure note with pool health, CSV states, resiliency config, and node states. Needs a NinjaOne stored script or working PS remoting credential path first.
- [ ] **NinjaOne S2D health script** — Create a stored PowerShell script in NinjaOne that runs the key S2D cmdlets and dumps clean output. Unlocks `ninja_run_script` for ad-hoc cluster queries from any skill without an open PS session. `ninja_list_scripts` currently 404s — investigate why.
- [ ] **`/patch-cluster` or CAU workflow in `/patch-campaign`** — Safe patching sequence for S2D clusters: drain CSV owners, pause node, update, resume. MSDISK3 (last rebooted 2023-02-13) is the safest first drain. All 6 nodes need patches; 3 have pending WINDOWS_PM reboots.

---

## Obsidian vault writes — Local REST API (from 2026-06-02)

Vault writes from Claude Code go directly to the Windows filesystem via WSL. When Obsidian Sync is active, it can revert these writes if it considers the server version newer — silent data loss with no error surfaced. Day Ender now has a Phase 2.5 verify+retry as a workaround, but the root fix is routing all vault writes through Obsidian's own API.

- [ ] **Enable Obsidian Local REST API plugin** — install `obsidian-local-rest-api` from community plugins; note the API key and port (default 27124)
- [ ] **Add vault-write MCP tool** — new tool in `mcp-server/` that POSTs to `https://localhost:27124/vault/{path}` with the Local REST API key from BW. Supports `mode: append` and `mode: rewrite`. Replaces direct filesystem writes for all vault operations.
- [ ] **Update Day Starter + Day Ender skills** to use the new MCP tool instead of native Write/append for daily note writes
- [ ] **Remove Phase 2.5 verify workaround** from Day Ender once the REST API path is stable

---

## Investigate JSON-structured skill output (from 2026-06-02)

- [x] Template extraction done 2026-06-04: task blocks → `.claude/templates/task-blocks.md` (shared), UniFi sites → `config.yaml`, day-starter -18% / day-ender -31%. JSON-as-skill-output (vs. narrative) is a future pass — the staging layer already uses structured JSON between collector and skills.

---

## Obsidian workflow improvements (from Steph Ango vault comparison, 2026-06-04)

- [ ] **Unresolved links as breadcrumbs** — in incident and investigation notes, write `[[Assets/DEVICENAME]]` wikilinks even before the asset note exists. Surfaces CMDB gaps automatically via Obsidian Graph view; makes `/asset-investigation` and `/backlink-update` runs more targeted. Add this to the IR Triage and investigation skill prompts as a reminder.
- [ ] **Random revisit habit / vault-audit skill** — periodic session using the Obsidian random note hotkey to surface stale content skills don't automatically find: asset pages predating current frontmatter schema, investigations stuck at `draft`, incidents never archived. Could be a lightweight `/vault-audit` skill or just a recurring habit note.

---

## Backlink updater improvements (from 2026-06-02)

- [x] **MOC coverage** — Phase 2 implemented in skill (2026-06-04)
- [x] **Frontmatter audit** — Phase 3 implemented in skill (2026-06-04)
- [x] **Tag consistency** — Phase 4 implemented in skill (2026-06-04)

---

## WSL backup gaps (from 2026-06-02)

Checked `Backups/WSL/` on OneDrive. Two issues found:

- [x] **`~/.claude/` not in rclone scope** — fixed 2026-06-04: backup.sh now syncs `*/memory/` from both `~/.claude/` and `~/.claude-dev/` plus `settings.json`. Excludes sessions, telemetry, cache.
- [x] **Backup snapshot stale since May 26** — false alarm; backup was running daily. Logs confirmed healthy through June 4.
