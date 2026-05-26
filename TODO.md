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

## Optional / later

- [ ] TTL cache on `ninja_list_servers` and `admin_get_service_health` — reduces repeat calls in day-starter sessions
- [ ] Shape `teams.ts` write ops — `send_message`, `create_channel`, `add_member` still return raw API responses
- [ ] Re-enable IR Triage skill — currently `SKILL.md.disabled`; re-enable once comfortable with tiered confirmation model
- [ ] `sa_stevens` / `da_stevens` non-interactive PSRemoting — add `SA_REMOTE_PASSWORD` and `DA_REMOTE_PASSWORD` to BW to enable automated skills that currently require `Get-Credential`
- [ ] Configure rclone remotes (`onedrive` and `gdrive`) — see `docs/setup/backup.md`
