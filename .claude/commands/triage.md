Run a deep-dive triage on the device or user: $ARGUMENTS

First, determine the input type:
- **Hostname** — no @ symbol, looks like a machine name (e.g. "WEB-01", "DC-02")
- **User UPN** — contains @ (e.g. "jsmith@company.com")

---

**If HOSTNAME — run these in parallel:**
1. Find the device in NinjaOne: use `ninja_list_servers` and match on the name, then call `ninja_get_server` with the device ID for full detail
2. Get active NinjaOne alerts via `ninja_list_device_alerts`
3. Get pending critical patches via `ninja_list_pending_patches` with severity=critical
4. Get disk volumes via `ninja_list_volumes`; flag any volume above 85% capacity
5. Find the device in MDE via `mde_list_devices` (match computerDnsName to the hostname), then:
   - Call `mde_get_device` for full detail including risk score and exposure level
   - Call `mde_list_alerts` filtered for this device
   - Call `mde_get_device_vulnerabilities` with severity=Critical

**If USER UPN — run these in parallel:**
1. Get their Entra MFA methods via `entra_get_user_mfa_methods`
2. Check risky user status via `entra_list_risky_users` with risk_level=all — look for this UPN
3. List MDE alerts and filter for ones mentioning this user
4. Search NinjaOne for devices associated with this user via `ninja_list_servers`

---

**Output:**

## Triage: $ARGUMENTS

**Status:** [Online / Offline / Unknown]  **Risk Level:** [Critical / High / Medium / Low / Clean]

### Alerts
### Vulnerabilities / Patches
### Health (disk, uptime, services)
### Identity (MFA, risk flags)

### Recommended Actions
1. [Most urgent first — be specific with tool names if action is available]
