Run a comprehensive security posture audit using the IT ops tools. Work through these checks in parallel where possible, then consolidate into a prioritized report.

**Entra ID checks:**
- List risky users at all levels (top 50) via `entra_list_risky_users` with risk_level=all
- Find secrets/certs expiring within 60 days via `entra_list_expiring_secrets` with days=60
- List all Conditional Access policies via `entra_list_conditional_access_policies`; flag any in disabled or report-only state
- List directory roles via `entra_list_directory_roles`, then fetch members of Global Administrator, Privileged Role Administrator, and Security Administrator via `entra_get_role_members` — flag roles with more than 2 members

**Defender for Endpoint checks:**
- List active High and Critical severity alerts (status=New) via `mde_list_alerts`
- List devices with High or Critical risk scores via `mde_list_devices` with risk_score=High, then risk_score=Critical
- Get the top 20 TVM security recommendations ordered by exposure impact via `mde_get_security_recommendations`

**NinjaOne checks:**
- List all servers via `ninja_list_servers`; flag any that appear offline
- Get fleet-wide backup status via `ninja_list_all_backups`; flag jobs with failed or error status

**Output — present as a prioritized action report:**

## Security Posture Report — [today's date]

### 🔴 Critical (act today)
### 🟠 High (fix this week)
### 🟡 Medium (schedule this sprint)
### ✅ No Issues Found

Keep each finding to one line with the key detail (name, expiry date, risk level, etc.). Close with a summary line: "X critical · Y high · Z medium items open."
