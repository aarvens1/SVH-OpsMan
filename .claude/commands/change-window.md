Set up a planned maintenance window. Input: $ARGUMENTS

Parse the input for a device name and duration. Examples:
- "WEB-01 2h" → device=WEB-01, duration=2 hours (7200 seconds)
- "DC-02 for 4 hours" → device=DC-02, duration=4 hours (14400 seconds)
- "SQL-03" → device=SQL-03, duration=1 hour (3600 seconds, default)

---

**Step 1 — Pre-maintenance checks (run in parallel)**
1. Find the device in NinjaOne via `ninja_list_servers`, then call `ninja_get_server` for current status
2. Check for any active MDE alerts on the device via `mde_list_alerts`
3. Check disk space via `ninja_list_volumes` — flag volumes above 85% (patching needs space)
4. List pending critical patches via `ninja_list_pending_patches` with severity=critical — note if this change window is a good time to apply them

Report these pre-checks to the user and ask: **"All checks complete. Proceed with opening the maintenance window?"** — wait for confirmation before continuing.

---

**Step 2 — Open the window (after confirmation, run in parallel)**
1. Set NinjaOne maintenance mode via `ninja_set_maintenance_mode` with the calculated duration_seconds and reason="Planned maintenance via Claude"
2. Send a Teams notification via `teams_send_message` — first list teams via `teams_list_teams` and channels via `teams_list_channels` to find the IT-Ops or IT-Operations channel, then send: "🔧 Maintenance window opened for [device] — duration [X hour(s)], started [time]. Monitoring suppressed."
3. Create a tracking task via `planner_list_plans` to find the IT ops plan, then `planner_create_task` with title "Maintenance: [device]" and note the start time and planned duration

---

**Step 3 — Confirm and hand off**

Report the outcome of each action. Then remind the user:

> Maintenance window is open. When work is complete, say **"close maintenance window for [device]"** and I'll exit NinjaOne maintenance mode, confirm in Teams, and close the Planner task.

---

**Output:**

## Maintenance Window Opened: [device]

**Duration:** [X hour(s)] — closes ~[estimated end time]

| Action | Status |
|---|---|
| NinjaOne maintenance mode | ✅ / ❌ |
| Teams notification sent | ✅ / ❌ |
| Planner task created | ✅ / ❌ |

**Pre-check findings:** [any patches to apply, disk warnings, active alerts]
