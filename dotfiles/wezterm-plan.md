# WezTerm + Obsidian Environment Plan

A persistent, keyboard-native ops workspace replacing Windows Terminal. WezTerm handles the full terminal environment on the Windows side; Obsidian runs alongside it as a separate window. Together they form a single workspace — no multiplexer needed, no context switching between disparate tools.

---

## Goals

- Collapse the morning startup sequence (BW unlock → Claude start → day-starter) into one command
- Ambient status awareness without invoking a skill
- Keyboard-native navigation — tabs, splits, skill invocation, all via chords
- Version-controlled, reproducible environment config

## Out of scope

- mRemoteNG stays as-is — auto-creds and tabbed connections are not worth replacing
- No TUI tool browser — Claude + skills already handle interactive queries better than a CLI layer would
- No Neovim/obsidian.nvim — Obsidian GUI stays for Dataview, Excalidraw, graph view

---

## Architecture

```
Windows (native)
├── WezTerm (~60% screen, right)
│   ├── WSL panes — Claude Code, bash
│   ├── PowerShell panes
│   └── Status bar (Lua-scripted, bottom)
└── Obsidian (~40% screen, left, sidebar collapsed)
```

WezTerm is a native Windows app. WSL shells run inside WezTerm panes — same as Windows Terminal today, just WezTerm instead. PowerShell panes run natively (no WSL layer).

---

## Screen Layout

```
┌──────────────────┬─────────────────────────┐
│                  │  [Claude][pwsh][bash][+] │
│    Obsidian      │                          │
│    ~40%          │       WezTerm            │
│                  │       ~60%               │
│  (sidebar        │                          │
│   collapsed)     │                          │
│                  │                          │
│                  ├─────────────────────────┤
│                  │ status bar (see below)   │
└──────────────────┴─────────────────────────┘
```

- Obsidian on the left — reading/reference surface
- WezTerm on the right — action surface
- Obsidian left sidebar collapsed to maximise note reading width
- No OS-level tiling manager (FancyZones etc.) — manually positioned for now

### WezTerm pane splits

Default is a single full-height pane. On demand, split into 2 or 3 stacked rows:

```
Single              Split 2              Split 3
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│               │   │   pane 1      │   │   pane 1      │
│               │   ├───────────────┤   ├───────────────┤
│   full pane   │   │   pane 2      │   │   pane 2      │
│               │   │               │   ├───────────────┤
│               │   │               │   │   pane 3      │
└───────────────┘   └───────────────┘   └───────────────┘
```

Each pane is independently tabbed — e.g. Claude top, bash middle, pwsh bottom.
Splits are explicit (separate chords for 2-way and 3-way), not toggle.

---

## Tab System

### Color coding by type

| Type | Color | Examples |
|------|-------|---------|
| Claude Code | Blue | `Claude`, `Claude/IR`, `Claude/patch` |
| PowerShell | Yellow | `pwsh`, `pwsh/cluster` |
| WSL bash | Green | `bash`, `bash/logs` |

### Naming

- WezTerm auto-names from the foreground process by default
- `node` overridden to display as `Claude` at launch time (process name is not meaningful)
- Manual rename via chord when a tab earns a specific purpose
- Convention: `type` for generic tabs, `type/context` for purpose tabs (e.g. `Claude/IR`, `pwsh/cluster`)
- Slash as separator — short and readable in a crowded tab bar

---

## Status Bar

Lives at the bottom of the WezTerm section, Lua-scripted. No separate pane — keeps the full WezTerm height available for work.

### Philosophy

Quiet when everything is nominal. Noisy when it isn't.

- **Always visible:** session context + security signals (things demanding immediate attention)
- **Light up on change:** infrastructure + services (shown dimmed or hidden when nominal)

### Contents

```
BW ✓ · Wazuh 3 · MDE 1 · Risky 0 · Ninja 34/35 · M365 ✓ · UniFi ✓ · main* · 2m ago
```

| Indicator | Source | Always/On-change |
|-----------|--------|-----------------|
| BW session status | local `bw status` | Always |
| Wazuh alert count | Wazuh MCP | Always |
| Defender MDE alert count | MDE MCP | Always |
| Entra risky user count | Graph MCP | Always |
| NinjaOne device health (online/total) | NinjaOne MCP | On change |
| M365 service health | MS Admin MCP | On change |
| UniFi site health | UniFi MCP | On change |
| Git branch + dirty state | local git | Always |
| Last refresh timestamp | local | Always |

### Refresh

- Interval: every 2 minutes
- BW and git check locally (fast, no network)
- MCP data checks on interval (not on every keypress)
- Visual indicator when data is stale (e.g. refresh failed)

### Image support

WezTerm supports inline image rendering (iTerm2 protocol). Status bar can use this for
sparklines or mini graphs in future iterations — text only for day one.

### Screenshot → Claude

WezTerm clipboard + Claude Code's image paste support means screenshots can be pasted
directly into a Claude conversation. Take screenshot → clipboard → paste into Claude.
No config needed — works day one.

---

## Config Management

WezTerm config (`wezterm.lua`) lives in the repo and symlinks to the Windows config path:

```
Repo:    ~/SVH-OpsMan/dotfiles/wezterm.lua
Windows: C:\Users\astevens\.config\wezterm\wezterm.lua  (symlink)
```

Symlink created once during setup. After that, editing `dotfiles/wezterm.lua` in the repo
updates WezTerm on next reload — version controlled, reproducible.

The Windows PowerShell environment is separate and not managed by this repo.

---

## Launch Script

Single alias (`opsman` or similar) that:

1. Checks BW session validity — prompts unlock if expired
2. Opens WezTerm with the standard layout (if not already open)
3. Starts Claude Code in the Claude pane with MCPs connected
4. Names the Claude tab correctly (`Claude` not `node`)
5. Fires day-starter automatically

Alias lives in `dotfiles/bashrc.sh`. WezTerm workspace layout defined in `wezterm.lua`
using WezTerm's built-in mux API.

---

## Keybindings

All chords to be designed together in the build phase to avoid conflicts.
Planned categories:

| Category | Examples |
|----------|---------|
| Skill invocation | `leader + d` (day-starter), `leader + p` (posture-check), `leader + t` (troubleshoot) |
| Pane splits | explicit chord for 2-way, explicit chord for 3-way |
| Pane navigation | move focus between split panes |
| Tab management | new Claude tab, new pwsh tab, new bash tab, rename tab |
| Obsidian deep link | open last skill output note in Obsidian |

Leader key TBD — pick something that doesn't conflict with Claude Code, bash readline,
or PowerShell bindings.

---

## Obsidian Deep Links

When a skill completes, the output note path is printed to the terminal as an
`obsidian://` URI. WezTerm detects it as a hyperlink — one click opens the note
directly in Obsidian without navigating the vault manually.

Skills already write to structured vault paths (`Briefings/Daily/`, `Incidents/Active/`,
etc.) — the deep link just surfaces that path in the terminal output.

---

## Build Order

1. **WezTerm install + basic config skeleton** — get WezTerm running, symlink in place, repo connected
2. **Layout** — Obsidian/WezTerm split, tab bar position, pane defaults
3. **Tab colors and naming** — color by type, `node` → `Claude` override, rename chord
4. **Status bar — static** — layout and labels, hardcoded values to prove the structure
5. **Launch script** — BW check, Claude start, tab naming, day-starter invocation
6. **Keybindings** — full chord scheme, skill invocation, splits, tab management
7. **Status bar — dynamic** — wire MCP calls, refresh loop, on-change dimming
8. **Obsidian deep links** — detect `obsidian://` URIs in terminal output
9. **Pane splits** — 2-way and 3-way split chords
10. **Status bar — polish** — stale data indicator, sparklines if warranted

---

## Open Questions (resolve in build phase)

- Leader key selection
- Exact chord assignments (do all at once to avoid conflicts)
- Whether day-starter fires automatically on launch or on a keypress
- Status bar behavior when MCP server is not running (BW locked / Claude not started)
- WezTerm window positioning — manual snap or a startup script that sizes/positions the window
