---
name: mailflow-investigation
description: Email delivery investigation. Traces a message from send to delivery (or failure), checks for Defender flagging, and validates mailbox accessibility. Trigger phrases: "did this email deliver", "why didn't X get my message", "email not received", "mail trace", "delivery bounce".
when_to_use: Use when email didn't arrive, bounced, was delayed, or was flagged. Works for inbound and outbound.
allowed-tools: "mcp__svh-opsman__exo_message_trace mcp__svh-opsman__exo_get_mailbox mcp__svh-opsman__exo_get_mailbox_auto_reply mcp__svh-opsman__mde_list_indicators mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__obsidian__* mcp__time__*"
---

# Mailflow Investigation

## Step 1 — Get the facts

Collect before running any tools:
- Sender address and domain
- Recipient address
- Approximate send time and date
- Any bounce or NDR message text (paste it in)
- Was it internal-to-internal, external-to-internal, or internal-to-external?

## Step 2 — Exchange Admin message trace

`exo_message_trace` — trace the message. Note:
- Status: Delivered, Failed, Quarantined, Filtered, Pending
- Events in the trace (when each hop occurred)
- Any rejection reason or rule that fired

## Step 3 — Check for Defender interference

If status is Filtered or Quarantined, or if the message contained attachments/URLs:
- `mde_list_indicators` — is the sender domain, IP, or any URL/hash in the block list?
- `mde_list_alerts` — any related phishing or malware alerts triggered around the same time?

## Step 4 — Validate mailbox state

`exo_get_mailbox` for the recipient — is it enabled, is litigation hold on, any forwarding rules?
`exo_get_mailbox_auto_reply` — auto-reply active? Could give false impression of delivery.
`entra_get_sign_in_logs` for the recipient — was the account accessible at the time? Any conditional access blocks?

## Step 5 — Check for M365 service incident

`admin_get_service_health` / `admin_list_service_incidents` — any Exchange Online incident active during the relevant window?

## Output

Write `Investigations/YYYY-MM-DD-mailflow-[sender-to-recipient].md`:

```yaml
---
date: YYYY-MM-DD
skill: Mailflow Investigation
status: draft
tags: [investigation, mailflow]
---
```

Sections: Message details → Trace timeline → Root cause → Recommended action.

If the message was blocked by Defender correctly (known-bad sender/URL), note that — no further action needed. If incorrectly blocked, document steps to request release or whitelist adjustment.
