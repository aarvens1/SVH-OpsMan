# SVH TUI Style Guide

Design system for Textual-based terminal UIs in SVH-OpsMan. The PowerShell TUI in this directory is the reference implementation.

---

## Framework

**[Textual](https://textual.textualize.io/)** — Python terminal UI framework. All apps run via `python3 -m <package>`. Styling is via TCSS (a subset of CSS). Layout is driven by Textual's flexbox-like system.

---

## Layout Skeleton

Every SVH TUI follows this structure:

```
┌─ Header (show_clock=True) ──────────────────────────────────────┐
│ App Title                    sub_title                  HH:MM   │
├─ #sidebar (w=32) ──┬─ #right (1fr) ───────────────────────────┤
│                    │                                            │
│  #search           │  #detail (40%)                            │
│                    │    function name + synopsis                │
│  #func-tree        │    param inputs                           │
│  (collapsible      │    command preview                        │
│   module tree)     │    actions row                            │
│                    ├────────────────────────────────────────── │
│                    │  #output-section (1fr)                    │
│                    │    #output-log (RichLog)                   │
├────────────────────┴───────────────────────────────────────────┤
│ Footer (keybindings)                                            │
└─────────────────────────────────────────────────────────────────┘
```

Key measurements:
- Sidebar: `width: 32` (fixed)
- Detail panel: `height: 40%`
- Output section: `height: 1fr` (fills remainder)
- Borders: `tall $primary-darken-2` everywhere

---

## Color System — Gruvbox Dark

All colors are explicit hex values from the Gruvbox Dark palette. Never use Textual semantic tokens (`$surface`, `$primary`, etc.) — they are overridden by base.tcss and will not reflect Gruvbox.

### Palette reference

| Name | Hex | Use |
|------|-----|-----|
| BG Hard | `#1d2021` | Screen / output log background (darkest) |
| BG | `#282828` | Sidebar / header / footer |
| BG Soft | `#32302f` | Right-panel background |
| BG1 | `#3c3836` | Detail panel / raised surfaces / input backgrounds |
| BG2 | `#504945` | Inactive borders / button normal / hover base |
| BG3 | `#665c54` | Hover states / dim active |
| Gray | `#928374` | Comments / muted text |
| FG3 | `#a89984` | Secondary text / footer labels |
| FG | `#ebdbb2` | Primary text |
| Orange | `#fe8019` | **PRIMARY accent** — structural borders |
| Yellow | `#fabd2f` | **FOCUS** — focused inputs, selected tree items |
| Red | `#fb4934` | Error / destructive |
| Green | `#b8bb26` | Read / success |
| Blue | `#83a598` | Info / primary button |
| Purple | `#d3869b` | Module / category labels |
| Aqua | `#8ec07c` | Command preview text, secondary success |

### Design decisions

- Orange `#fe8019` for all structural dividers (sidebar right border, header bottom border) — the characteristic Gruvbox warm accent
- Yellow `#fabd2f` for all focus states — consistent across inputs, tree selection, buttons
- `round` border on inputs and panels; `tall` for structural separators
- Background hierarchy: BG Hard → BG → BG Soft → BG1 (darkest to lightest across screen depth)

Never use `$warning` or `$success` as background colors — they're for Button variants only in Textual.

---

## Risk Level Encoding

Functions that modify or delete data must be labeled. Three levels:

| Level | Rich color | Button variant | When |
|-------|-----------|----------------|------|
| `read` | `green` | `success` | GET, List, Query — no side effects |
| `write` | `yellow` | `warning` | SET, Add, Update — reversible |
| `destructive` | `red` | `error` | Remove, Delete, Block, Reset — requires confirm |

Implementation pattern (`app.py`):
```python
_RISK_COLOR   = {"read": "green",   "write": "yellow",   "destructive": "red"}
_RISK_LABEL   = {"read": "Read",    "write": "Write",    "destructive": "⚠ Destructive"}
_RISK_VARIANT = {"read": "success", "write": "warning",  "destructive": "error"}
```

Destructive commands must push a `ConfirmModal` before executing. See `ConfirmModal` in `app.py`.

---

## Component Patterns

### Sidebar navigation

```python
with Vertical(id="sidebar"):
    yield Input(placeholder="/ Search functions…", id="search")
    yield Tree("Modules", id="func-tree")
```

- Search filters the tree live on `Input.Changed`
- Tree nodes are module names; leaves are items with `.data` payloads
- Selecting a leaf drives the right panel via `on_tree_node_selected`

### Detail panel

```python
with VerticalScroll(id="detail"):
    yield Static("…", id="func-name")       # bold name + risk badge + module dim
    yield Static("", id="func-synopsis")    # $text-muted
    yield Static("", id="func-example")     # dim example
    yield Vertical(id="params-container")   # ParamRow widgets mount here
    yield Input(placeholder="…", id="cmd-preview")  # editable, auto-rebuilds
    with Horizontal(id="actions-row"):
        ...
```

### Parameter rows

Each param is a `Horizontal` with a `Label` (fixed `width: 26`) and either an `Input` or `Checkbox`. Mandatory params: append ` *` to label and use full `$text` color. Optional params: `$text-muted` label color.

### Output log

Always a `RichLog(highlight=True, markup=True, wrap=True)`. Prompt lines use `cyan bold`. Errors use `red`. Success messages use `green`. Session startup messages use `dim`.

Log line conventions:
```python
log.write(Text(f"\n❯ {command}", style="cyan bold"))   # command echo
log.write(Text("✓ Ready.", style="green bold"))         # success
log.write(Text("✗ Error: …", style="red bold"))         # failure
log.write(Text("(no output)", style="dim"))             # empty result
log.write(Text("→ Saved: …", style="green dim"))        # side-effect note
```

### Confirmation modal

Copy `ConfirmModal` from `app.py` verbatim. It's `ModalScreen[bool]` — push it, receive the result in a callback:

```python
self.push_screen(
    ConfirmModal(command),
    lambda confirmed: self._execute(command) if confirmed else None,
)
```

Styles live in `base.tcss`. No changes needed for new apps.

---

## Keybindings

Standard bindings every SVH TUI should include:

| Key | Action | Label |
|-----|--------|-------|
| `ctrl+f` | Focus search | `Search` |
| `ctrl+l` | Clear output log | `Clear` |
| `ctrl+r` | Run/submit | `Run` |
| `ctrl+q` | Quit | `Quit` |
| `escape` | Blur focused input | `Blur` |

Shown in the Textual Footer automatically via `BINDINGS`.

---

## Typography (Rich markup)

Use these inline Rich styles consistently:

| Pattern | Markup |
|---------|--------|
| Item name / function | `[bold]Name[/bold]` |
| Module or source | `[dim]SVH.AD[/dim]` |
| Risk label | `[green]Read[/green]` / `[yellow]Write[/yellow]` / `[red]⚠ Destructive[/red]` |
| Command prompt | `[cyan bold]❯ command[/cyan bold]` |
| Success | `[green bold]✓ …[/green bold]` |
| Failure | `[red bold]✗ …[/red bold]` |
| Dim/secondary | `[dim]…[/dim]` |

Never use emoji in section headings. `✓`, `✗`, `❯`, `⚠` are the only glyphs used — they're ASCII/Unicode punctuation, not emoji.

---

## Sub-title convention

Use `self.sub_title` to surface live state in the header:

```python
self.sub_title = f"{n_items} items · {n_sources} sources"
# After connection:
self.sub_title += "  |  ● Connected"
# On error:
self.sub_title += "  |  ✗ Session Error"
```

---

## Starting a new SVH TUI

1. Create `yourapp/` package alongside `tui/` in the repo root.
2. Copy `tui/__init__.py`, `tui/__main__.py`, `tui/base.tcss` as starting points.
3. Set `CSS_PATH = ["base.tcss", "app.tcss"]` in your `App` class.
4. Write `app.tcss` for your layout — start from the skeleton above.
5. Reuse `ConfirmModal` verbatim for any destructive operations.
6. Run via `python3 -m yourapp` from the repo root, or add an entry in `run-tui.sh`.

What to customize vs. keep fixed:
- **Keep fixed:** Risk encoding, modal pattern, keybinding set, log line conventions, Gruvbox palette
- **Customize freely:** Sidebar content, detail panel layout, sub-title content, panel size ratios, sidebar width (default 32 — can go up to 40 for wider content)
- **Do not change:** Palette hex values — always use the documented Gruvbox hex values, never Textual semantic tokens

---

## File reference

| File | Purpose |
|------|---------|
| `tui/app.py` | Reference implementation — the PowerShell TUI |
| `tui/app.tcss` | App-specific layout styles |
| `tui/base.tcss` | Shared styles: modal, sidebar, output log |
| `tui/STYLE_GUIDE.md` | This document |
