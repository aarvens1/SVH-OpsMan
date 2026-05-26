# SVH OpsMan — Branch TODO

Everything needed to get `claude/opsman-gemini-cli-fit-bVRkY` → main and fully working.

---

## 1. Merge PR #44

- [ ] Review and merge PR #44 into main on GitHub

---

## 2. WSL one-time setup (run on the actual machine after merge)

- [ ] `git pull` on the WSL machine
- [ ] `bash ~/SVH-OpsMan/scripts/setup.sh` — builds mcp-server + collector, installs systemd user units, enables services
- [ ] Verify services came up:
  ```bash
  systemctl --user status svh-opsman-bw-unlock.service
  systemctl --user status svh-opsman-mcp.service
  systemctl --user list-timers svh-opsman-briefing.timer
  ```
- [ ] Re-register the MCP with Claude Code if needed:
  ```bash
  claude mcp add svh-opsman -- node ~/SVH-OpsMan/mcp-server/dist/index.js
  ```
- [ ] Register the Windows Task Scheduler task for WSL auto-start at login:
  ```powershell
  schtasks.exe /Create /TN "SVH OpsMan WSL Services" `
    /TR "powershell.exe -NonInteractive -WindowStyle Hidden -File `"$env:USERPROFILE\SVH-OpsMan\powershell\Start-WSLServices.ps1`"" `
    /SC ONLOGON /RU "$env:USERNAME" /F
  ```

---

## 3. Windows Credential Manager — store BW master password (one-time)

- [ ] From Windows PowerShell:
  ```powershell
  $cred = Get-Credential -UserName "svh-opsman" -Message "Enter Bitwarden master password"
  New-StoredCredential -Target svh-opsman -UserName svh-opsman `
    -Password $cred.GetNetworkCredential().Password -Persist LocalMachine
  ```
- [ ] Test the unlock script: `bash ~/SVH-OpsMan/scripts/bw-auto-unlock.sh`
  - Should print: `[bw-auto-unlock] Vault unlocked, session written to ~/.config/svh-opsman/bw-session`

---

## 4. Bitwarden — add credentials for newly wired services

Add each of these as custom fields on the **SVH OpsMan** BW item. See `references/credentials.md` for what each value should contain.

### Already have credentials, just need to add to BW
- [ ] `WAZUH_URL` · `WAZUH_USERNAME` · `WAZUH_PASSWORD`
- [ ] `CONFLUENCE_DOMAIN` · `CONFLUENCE_EMAIL` · `CONFLUENCE_API_TOKEN`
- [ ] `UNIFI_API_KEY` (UI.com cloud)
- [ ] `UNIFI_SVH_URL` · `UNIFI_SVH_KEY` (+ any other site pairs: PDX, BOI, EUG, SEA, FGT, warehouse variants)
- [ ] `PRINTERLOGIC_URL` · `PRINTERLOGIC_API_TOKEN`
- [ ] `FRESHSERVICE_DOMAIN` · `FRESHSERVICE_API_KEY`
- [ ] `SYNOLOGY_HOST` · `SYNOLOGY_USER` · `SYNOLOGY_PASSWORD`

### Needs setup first, then add to BW
- [ ] **Google OAuth2** — create GCP OAuth2 client (Web app type), generate refresh token with scopes:
  `email`, `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/gmail.modify`
  Then add: `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_REFRESH_TOKEN` · `GOOGLE_USER_EMAIL`
- [ ] **Have I Been Pwned** — subscribe at haveibeenpwned.com (paid), then add: `HIBP_API_KEY`

### When ready (not urgent)
- [ ] **Cloudflare** — `CLOUDFLARE_API_TOKEN` (Zone:Read + Analytics:Read + Firewall:Read)
- [ ] **n8n** — `N8N_URL` · `N8N_API_KEY`

---

## 5. Verify new tools work end-to-end

Once BW credentials are in place, test at least one tool per new service:

- [ ] `synology_storage_info` — confirms NAS connectivity + DSM auth
- [ ] `synology_m365_backup_status` — confirms ActiveBackup API access
- [ ] `freshservice_list_tickets` — confirms API key and domain
- [ ] `gmail_list_recent` — confirms Google OAuth2 refresh flow
- [ ] `gcal_list_events` — confirms Calendar scope
- [ ] `hibp_check_account` with `astevens@shoestringvalley.com`
- [ ] `unifi_restart_device` against a non-critical test AP — verify colon MAC format in logs
- [ ] `ninja_set_maintenance_mode` on a test device — enable then immediately disable

---

## 6. Skill frontmatter — add new tools to `allowed-tools`

None of the skills reference the new tools yet. Update `.claude/skills/*/SKILL.md` frontmatter:

| Skill | Tools to add |
|-------|-------------|
| `day-starter` | `synology_m365_backup_status` · `synology_m365_backup_logs` |
| `onprem-health` | `synology_storage_info` · `synology_m365_backup_status` · `synology_m365_backup_logs` |
| `posture-check` | `hibp_check_account` (check key accounts for breach exposure) |
| `asset-investigation` | `hibp_check_account` · `hibp_check_pastes` (user path only) |
| `access-review` | `hibp_check_account` · `hibp_check_pastes` |
| `ticketsmith` | `freshservice_create_ticket` · `freshservice_list_tickets` |
| `network-troubleshooter` | `cloudflare_list_zones` · `cloudflare_list_dns_records` · `cloudflare_list_firewall_events` (once Cloudflare creds are in) |

---

## 7. Optional / later

These are known gaps, not blockers:

- [ ] **Obsidian templates** — create skeleton notes in `OpsManVault/Templates/` for Day Starter, Incident, Change Record, Asset Investigation; update skills to use them
- [ ] **TTL cache** on `ninja_list_servers` and `admin_get_service_health` — both tools are fully shaped, cache would reduce repeat calls in day-starter sessions
- [ ] **Shape `teams.ts` write ops** — `send_message`, `create_channel`, `add_member` still return raw API responses
- [ ] **Re-enable IR Triage** — currently `SKILL.md.disabled`; re-enable once you're comfortable with the tiered confirmation model
- [ ] **Pre-aggregation for day-starter** — script that runs before the session and writes a staging JSON; would eliminate 10–15 tool calls per morning
- [ ] **PowerShell → vault pipeline** — `Export-SVHToVault` pattern so on-prem data (MABS jobs, cluster health, compliance gap) writes to vault automatically instead of requiring a manual PS run
- [ ] **`sa_stevens` / `da_stevens` non-interactive PSRemoting** — add `SA_REMOTE_PASSWORD` and `DA_REMOTE_PASSWORD` to BW to enable automated skills that currently require `Get-Credential`
