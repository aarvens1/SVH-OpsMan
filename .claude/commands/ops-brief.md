Generate the morning IT ops briefing. Pull all data in parallel, then render a concise standup card.

**Data to collect:**
1. Active High-severity MDE alerts (status=New) via `mde_list_alerts` with severity=High, status=New
2. Active Medium-severity MDE alerts (status=New) via `mde_list_alerts` with severity=Medium, status=New
3. High-risk Entra users via `entra_list_risky_users` with risk_level=high
4. App secrets expiring within 14 days via `entra_list_expiring_secrets` with days=14
5. Fleet backup status via `ninja_list_all_backups` — count jobs with failed/error status
6. All servers via `ninja_list_servers` — identify any offline devices

**Output — a tight standup card, nothing more:**

## IT Ops Briefing — [today's date, day of week]

| Area | Status | Detail |
|---|---|---|
| MDE High Alerts | 🔴 N open / ✅ Clear | [top alert name if any] |
| MDE Medium Alerts | 🟠 N open / ✅ Clear | |
| Entra Risky Users | 🔴 N / ✅ Clear | [names if any] |
| Expiring Secrets (<14d) | 🟡 N / ✅ Clear | [app names if any] |
| Failed Backups | 🔴 N / ✅ Clear | [device names if any] |
| Offline Servers | 🔴 N / ✅ Clear | [names if any] |

**Action Items:**
- [One line per item that needs attention today, with specifics]

If everything is clear, end with: "✅ All systems nominal — good morning."
