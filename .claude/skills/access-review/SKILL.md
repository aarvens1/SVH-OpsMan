---
name: access-review
description: Access and permission audit for a user, group, or Entra role. Flags inactive privileged accounts, missing MFA in sensitive roles, and stale memberships. Trigger phrases: "access review for [user/group/role]", "audit permissions for X", "who has access to Y".
when_to_use: Use for privilege audits, compliance reviews, or investigating over-permissioned accounts.
allowed-tools: "mcp__svh-opsman__entra_list_directory_roles mcp__svh-opsman__entra_get_role_members mcp__svh-opsman__entra_list_app_registrations mcp__svh-opsman__entra_get_user_mfa_methods mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_list_conditional_access_policies mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__confluence_create_page mcp__svh-opsman__confluence_search_pages mcp__obsidian__* mcp__time__*"
---

# Access Review

## Route: User

1. `entra_get_role_members` — find all roles where this user is a member.
2. `entra_get_user_mfa_methods` — MFA registered? What methods?
3. `entra_get_sign_in_logs` — last active date, sign-in patterns. If no sign-in in 90+ days, flag.
4. `entra_list_app_registrations` — any app registrations owned by this user.
5. `entra_list_conditional_access_policies` — which CA policies apply.
6. `entra_get_audit_logs` — changes made by this account.

Flag: privileged role + no MFA, privileged role + no sign-in in 90 days, CA policy exclusion that shouldn't apply.

## Route: Group or Role

1. `entra_get_role_members` — all current members.
2. For each member: `entra_get_user_mfa_methods` + `entra_get_sign_in_logs` (last active).
3. `entra_get_audit_logs` — recent membership changes.
4. `entra_list_conditional_access_policies` — policies that reference this group/role.

Flag: stale members (no sign-in > 90 days), missing MFA, unexpected members.

## Output

Write `Reviews/Access/YYYY-MM-DD-[name].md`:

```yaml
---
date: YYYY-MM-DD
skill: Access Review
status: draft
tags: [review, access, identity]
---
```

Sections: Subject → Roles/memberships → MFA status → Last active → CA policy coverage → Findings & recommendations.

Optionally draft a Confluence audit page (`confluence_create_page`) if the user asks for a formal record.

## Escalation paths

- **Suspected active breach or account takeover** → `/tenant-forensics` for a full forensic sweep of the tenant
- **Recent suspicious activity on a specific user** → `/user-report` for a 7-day activity snapshot
- **Broad security posture concern** → `/posture-check`
