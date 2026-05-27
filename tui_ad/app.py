"""SVH AD Manager TUI — Active Directory user management."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

from textual import on, work
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    Checkbox,
    Footer,
    Header,
    Input,
    Label,
    RichLog,
    Static,
    Tree,
)
from rich.text import Text

from tui.obsidian import save_output
from tui.session import PowerShellSession, SessionState

CONNECT_SCRIPT = Path(__file__).parent.parent / "powershell" / "connect.ps1"

_DEFAULT_DC = os.environ.get("SVH_DC", "ACCODC01")

_RISK_COLOR   = {"read": "green",   "write": "yellow",   "destructive": "red"}
_RISK_LABEL   = {"read": "Read",    "write": "Write",    "destructive": "⚠ Destructive"}
_RISK_VARIANT = {"read": "success", "write": "warning",  "destructive": "error"}

# ── Operation definitions ──────────────────────────────────────────────────────
# Each param dict: name, type, mandatory, default
# DomainController is always the first param and is pre-filled from env / default.

def _dc(default: str = _DEFAULT_DC) -> dict[str, Any]:
    return {"name": "DomainController", "type": "string", "mandatory": True, "default": default}

OPERATIONS: dict[str, dict[str, Any]] = {
    "Locked Accounts": {
        "cmd": "Get-SVHADLockedAccounts",
        "synopsis": "List all currently locked-out AD user accounts.",
        "risk": "read",
        "params": [_dc()],
    },
    "Password Expiry": {
        "cmd": "Get-SVHADPasswordExpiry",
        "synopsis": "Show accounts whose passwords expire within N days.",
        "risk": "read",
        "params": [
            _dc(),
            {"name": "DaysAhead", "type": "int", "mandatory": False, "default": "14"},
        ],
    },
    "Stale Users (90d)": {
        "cmd": "Get-SVHADStaleUsers",
        "synopsis": "Find user accounts with no login in N days.",
        "risk": "read",
        "params": [
            _dc(),
            {"name": "DaysInactive", "type": "int", "mandatory": False, "default": "90"},
        ],
    },
    "Disabled Accounts": {
        "cmd": "Get-SVHADDisabledUsers",
        "synopsis": "List all disabled AD user accounts.",
        "risk": "read",
        "params": [_dc()],
    },
    "Look Up User": {
        "cmd": "Get-SVHADUser",
        "synopsis": "Retrieve full details for a single AD user.",
        "risk": "read",
        "params": [
            _dc(),
            {"name": "Identity", "type": "string", "mandatory": True, "default": ""},
        ],
    },
    "Unlock Account": {
        "cmd": "Unlock-SVHADAccount",
        "synopsis": "Unlock a locked-out AD account.",
        "risk": "write",
        "params": [
            _dc(),
            {"name": "Identity", "type": "string", "mandatory": True, "default": ""},
        ],
    },
    "Enable Account": {
        "cmd": "Set-SVHADUserEnabled",
        "synopsis": "Re-enable a disabled AD user account.",
        "risk": "write",
        "params": [
            _dc(),
            {"name": "SamAccountName", "type": "string", "mandatory": True, "default": ""},
            {"name": "Enable", "type": "bool", "mandatory": False, "default": "true"},
        ],
    },
    "Disable Account": {
        "cmd": "Set-SVHADUserEnabled",
        "synopsis": "Disable an active AD user account.",
        "risk": "write",
        "params": [
            _dc(),
            {"name": "SamAccountName", "type": "string", "mandatory": True, "default": ""},
            {"name": "Enable", "type": "bool", "mandatory": False, "default": "false"},
        ],
    },
    "Reset Password": {
        "cmd": "Reset-SVHADPassword",
        "synopsis": "Reset an AD user password (optionally force change at next login).",
        "risk": "write",
        "params": [
            _dc(),
            {"name": "SamAccountName", "type": "string", "mandatory": True, "default": ""},
            {"name": "NewPassword", "type": "password", "mandatory": True, "default": ""},
            {"name": "ForceChange", "type": "switch", "mandatory": False, "default": ""},
        ],
    },
    "Look Up Group": {
        "cmd": "Get-SVHADGroup",
        "synopsis": "Show details and membership count for an AD group.",
        "risk": "read",
        "params": [
            _dc(),
            {"name": "Identity", "type": "string", "mandatory": True, "default": ""},
        ],
    },
    "User's Groups": {
        "cmd": "Get-SVHADUserGroups",
        "synopsis": "List all groups a user belongs to.",
        "risk": "read",
        "params": [
            _dc(),
            {"name": "SamAccountName", "type": "string", "mandatory": True, "default": ""},
        ],
    },
    "Add to Group": {
        "cmd": "Add-SVHADGroupMember",
        "synopsis": "Add a user to an AD security or distribution group.",
        "risk": "write",
        "params": [
            _dc(),
            {"name": "GroupName", "type": "string", "mandatory": True, "default": ""},
            {"name": "SamAccountName", "type": "string", "mandatory": True, "default": ""},
        ],
    },
    "Remove from Group": {
        "cmd": "Remove-SVHADGroupMember",
        "synopsis": "Remove a user from an AD group.",
        "risk": "destructive",
        "params": [
            _dc(),
            {"name": "GroupName", "type": "string", "mandatory": True, "default": ""},
            {"name": "SamAccountName", "type": "string", "mandatory": True, "default": ""},
        ],
    },
    "Look Up Computer": {
        "cmd": "Get-SVHADComputer",
        "synopsis": "Retrieve AD computer object details.",
        "risk": "read",
        "params": [
            _dc(),
            {"name": "Identity", "type": "string", "mandatory": True, "default": ""},
        ],
    },
    "Stale Computers": {
        "cmd": "Get-SVHADStaleComputers",
        "synopsis": "Find computer accounts with no activity in N days.",
        "risk": "read",
        "params": [
            _dc(),
            {"name": "DaysInactive", "type": "int", "mandatory": False, "default": "90"},
        ],
    },
    "Domain Info": {
        "cmd": "Get-SVHADDomainInfo",
        "synopsis": "Show general domain configuration and metadata.",
        "risk": "read",
        "params": [_dc()],
    },
    "AD Replication": {
        "cmd": "Get-SVHADReplication",
        "synopsis": "Check replication status between domain controllers.",
        "risk": "read",
        "params": [_dc()],
    },
    "DC Summary": {
        "cmd": "Get-SVHADDCSummary",
        "synopsis": "List all domain controllers with role and status info.",
        "risk": "read",
        "params": [_dc()],
    },
}

# Tree structure: category → list of operation names
TREE_STRUCTURE: list[tuple[str, list[str]]] = [
    ("Account Status", [
        "Locked Accounts",
        "Password Expiry",
        "Stale Users (90d)",
        "Disabled Accounts",
    ]),
    ("User Operations", [
        "Look Up User",
        "Unlock Account",
        "Enable Account",
        "Disable Account",
        "Reset Password",
    ]),
    ("Group Operations", [
        "Look Up Group",
        "User's Groups",
        "Add to Group",
        "Remove from Group",
    ]),
    ("Computers", [
        "Look Up Computer",
        "Stale Computers",
    ]),
    ("Domain Health", [
        "Domain Info",
        "AD Replication",
        "DC Summary",
    ]),
]


# ── Confirmation modal ─────────────────────────────────────────────────────────

class ConfirmModal(ModalScreen[bool]):
    """Full-screen modal asking the user to confirm a destructive command."""

    BINDINGS = [("escape", "cancel", "Cancel")]

    def __init__(self, command: str) -> None:
        super().__init__()
        self._command = command

    def compose(self) -> ComposeResult:
        with Vertical(id="confirm-dialog"):
            yield Label("⚠  Destructive Command — Confirm Before Running", id="confirm-title")
            yield Static(self._command, id="confirm-cmd")
            with Horizontal(id="confirm-buttons"):
                yield Button("Run It", id="btn-confirm", variant="error")
                yield Button("Cancel", id="btn-cancel")

    @on(Button.Pressed, "#btn-confirm")
    def _confirm(self) -> None:
        self.dismiss(True)

    @on(Button.Pressed, "#btn-cancel")
    def _cancel(self) -> None:
        self.dismiss(False)

    def action_cancel(self) -> None:
        self.dismiss(False)


# ── Parameter row widget ───────────────────────────────────────────────────────

class ParamRow(Horizontal):
    """One row per PowerShell parameter: label + Input or Checkbox."""

    def __init__(self, param: dict[str, Any]) -> None:
        super().__init__(classes="param-row")
        self._param = param

    def compose(self) -> ComposeResult:
        p = self._param
        name = p["name"]
        ptype = p["type"]
        mandatory = p["mandatory"]
        default = p.get("default", "")

        label_classes = "param-label -mandatory" if mandatory else "param-label"
        suffix = " *" if mandatory else ""
        if ptype not in ("string", "switch", "password"):
            suffix += f" [{ptype}]"

        yield Label(f"{name}{suffix}", classes=label_classes)

        widget_id = f"param-{name}"
        if ptype == "switch":
            yield Checkbox("", id=widget_id, classes="param-input", value=False)
        elif ptype == "bool":
            checked = default.lower() in ("true", "$true", "1")
            yield Checkbox("", id=widget_id, classes="param-input", value=checked)
        elif ptype == "password":
            placeholder = "required" if mandatory else "optional"
            yield Input(
                id=widget_id,
                placeholder=placeholder,
                password=True,
                classes="param-input",
            )
        else:
            placeholder = default if default else ("required" if mandatory else "optional")
            yield Input(
                id=widget_id,
                value=default,
                placeholder=placeholder,
                classes="param-input",
            )


# ── Main application ───────────────────────────────────────────────────────────

class ADTui(App):
    """SVH AD Manager — Active Directory user management TUI."""

    CSS_PATH = ["../tui/base.tcss", "app.tcss"]
    TITLE = "SVH AD Manager"
    BINDINGS = [
        ("ctrl+f", "focus_search", "Search"),
        ("ctrl+l", "clear_output", "Clear"),
        ("ctrl+r", "run_command", "Run"),
        ("ctrl+q", "quit", "Quit"),
        ("escape", "blur_input", "Blur"),
    ]

    selected_op: reactive[Optional[str]] = reactive(None)

    def __init__(self) -> None:
        super().__init__()
        self._session = PowerShellSession(CONNECT_SCRIPT)
        # Filtered view of tree structure used during search
        self._filtered: list[tuple[str, list[str]]] = list(TREE_STRUCTURE)

    # ── Layout ────────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="main"):
            with Vertical(id="sidebar"):
                yield Input(placeholder="/ Search operations…", id="search")
                yield Tree("Modules", id="op-tree")

            with Vertical(id="right"):
                with Vertical(id="detail"):
                    yield Static("Select an operation from the sidebar →", id="op-title")
                    yield Static("", id="op-desc")
                    yield Vertical(id="params-container")
                    yield Input(
                        placeholder="Command preview (editable)",
                        id="cmd-preview",
                    )
                    with Horizontal(id="actions-row"):
                        yield Button("▶  Run", id="run-btn", variant="primary")

                with Vertical(id="output-section"):
                    yield RichLog(id="output-log", highlight=True, markup=True, wrap=True)

        yield Footer()

    # ── Startup ───────────────────────────────────────────────────────────────

    def on_mount(self) -> None:
        self._populate_tree(TREE_STRUCTURE)
        self._start_session()

    def _populate_tree(self, structure: list[tuple[str, list[str]]]) -> None:
        tree = self.query_one("#op-tree", Tree)
        tree.root.remove_children()
        tree.root.expand()
        for category, ops in structure:
            node = tree.root.add(category, expand=False)
            for op_name in ops:
                node.add_leaf(op_name, data=op_name)

    @work
    async def _start_session(self) -> None:
        log = self.query_one("#output-log", RichLog)
        log.write(Text("Starting session…", style="dim"))
        output = await self._session.start()

        if output.strip():
            for line in output.strip().splitlines():
                log.write(Text(line, style="dim"))

        if self._session.state == SessionState.CONNECTED:
            log.write(Text("✓ Session ready.", style="green bold"))
            self.sub_title = "● Connected"
        else:
            log.write(Text(
                f"✗ Session failed: {self._session.error}\n"
                "Make sure BW_SESSION is set and pwsh is installed.",
                style="red bold",
            ))
            self.sub_title = "✗ Session Error"

    # ── Tree selection ────────────────────────────────────────────────────────

    def on_tree_node_selected(self, event: Tree.NodeSelected) -> None:
        op_name = event.node.data
        if isinstance(op_name, str) and op_name in OPERATIONS:
            self.selected_op = op_name

    def watch_selected_op(self, op_name: Optional[str]) -> None:
        if op_name is not None:
            self.call_later(self._populate_detail, op_name)

    def _populate_detail(self, op_name: str) -> None:
        op = OPERATIONS[op_name]
        risk = op["risk"]
        color = _RISK_COLOR[risk]
        label = _RISK_LABEL[risk]

        self.query_one("#op-title", Static).update(
            f"[bold]{op_name}[/bold]  [{color}]{label}[/{color}]  [dim]{op['cmd']}[/dim]"
        )
        self.query_one("#op-desc", Static).update(op.get("synopsis", ""))

        container = self.query_one("#params-container", Vertical)
        container.remove_children()
        if op.get("params"):
            container.mount(*[ParamRow(p) for p in op["params"]])

        btn = self.query_one("#run-btn", Button)
        btn.variant = _RISK_VARIANT[risk]

        # Build initial preview
        self.query_one("#cmd-preview", Input).value = self._build_command_for(op_name)

    # ── Search ────────────────────────────────────────────────────────────────

    @on(Input.Changed, "#search")
    def _on_search(self, event: Input.Changed) -> None:
        query = event.value.lower().strip()
        if not query:
            self._populate_tree(TREE_STRUCTURE)
            return

        filtered: list[tuple[str, list[str]]] = []
        for category, ops in TREE_STRUCTURE:
            matches = [
                op for op in ops
                if query in op.lower() or query in category.lower()
            ]
            if matches:
                filtered.append((category, matches))

        self._populate_tree(filtered)
        # Expand all nodes when searching
        tree = self.query_one("#op-tree", Tree)
        for node in tree.root.children:
            node.expand()

    # ── Param inputs → command preview ────────────────────────────────────────

    @on(Input.Changed)
    def _on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id not in ("search", "cmd-preview"):
            self._rebuild_preview()

    @on(Checkbox.Changed)
    def _on_checkbox_changed(self, _: Checkbox.Changed) -> None:
        self._rebuild_preview()

    def _rebuild_preview(self) -> None:
        op_name = self.selected_op
        if op_name is None:
            return
        cmd = self._build_command_for(op_name)
        preview = self.query_one("#cmd-preview", Input)
        if preview.value != cmd:
            preview.value = cmd

    def _build_command_for(self, op_name: str) -> str:
        op = OPERATIONS[op_name]
        parts = [op["cmd"]]
        for p in op.get("params", []):
            name = p["name"]
            ptype = p["type"]
            wid = f"param-{name}"
            try:
                if ptype == "switch":
                    if self.query_one(f"#{wid}", Checkbox).value:
                        parts.append(f"-{name}")
                elif ptype == "bool":
                    val = self.query_one(f"#{wid}", Checkbox).value
                    parts.append(f"-{name} ${str(val).lower()}")
                elif ptype == "password":
                    val = self.query_one(f"#{wid}", Input).value.strip()
                    if val:
                        # Single-quoted to avoid PS variable interpolation
                        escaped = val.replace("'", "''")
                        parts.append(f"-{name} '{escaped}'")
                elif ptype == "int":
                    val = self.query_one(f"#{wid}", Input).value.strip()
                    if val:
                        parts.append(f"-{name} {val}")
                else:
                    val = self.query_one(f"#{wid}", Input).value.strip()
                    if val:
                        escaped = val.replace('"', '`"')
                        parts.append(f'-{name} "{escaped}"')
            except Exception:
                pass
        return " ".join(parts)

    # ── Run ───────────────────────────────────────────────────────────────────

    def action_run_command(self) -> None:
        self._handle_run()

    @on(Button.Pressed, "#run-btn")
    def _on_run_pressed(self, _: Button.Pressed) -> None:
        self._handle_run()

    def _handle_run(self) -> None:
        op_name = self.selected_op
        if op_name is None:
            self._log("No operation selected.", "dim")
            return

        op = OPERATIONS[op_name]

        # Validate mandatory non-switch/non-bool params
        for p in op.get("params", []):
            if p["mandatory"] and p["type"] not in ("switch", "bool"):
                wid = f"param-{p['name']}"
                try:
                    val = self.query_one(f"#{wid}", Input).value.strip()
                    if not val:
                        self._log(f"✗ Required parameter missing: -{p['name']}", "red")
                        return
                except Exception:
                    pass

        command = self.query_one("#cmd-preview", Input).value.strip()
        if not command:
            return

        if op["risk"] == "destructive":
            self.push_screen(
                ConfirmModal(command),
                lambda confirmed: self._execute(command) if confirmed else None,
            )
        else:
            self._execute(command)

    @work
    async def _execute(self, command: str) -> None:
        btn = self.query_one("#run-btn", Button)
        log = self.query_one("#output-log", RichLog)

        btn.disabled = True
        log.write(Text(f"\n❯ {command}", style="cyan bold"))

        output = await self._session.run(command)

        btn.disabled = False

        if not output.strip():
            log.write(Text("(no output)", style="dim"))
        elif output.lstrip().startswith("ERROR:"):
            log.write(Text(output.rstrip(), style="red"))
        else:
            log.write(Text(output.rstrip()))

        log.scroll_end(animate=False)

    # ── Actions ───────────────────────────────────────────────────────────────

    def action_focus_search(self) -> None:
        self.query_one("#search", Input).focus()

    def action_clear_output(self) -> None:
        self.query_one("#output-log", RichLog).clear()

    def action_blur_input(self) -> None:
        focused = self.focused
        if isinstance(focused, Input):
            focused.blur()

    def _log(self, msg: str, style: str = "white") -> None:
        self.query_one("#output-log", RichLog).write(Text(msg, style=style))

    # ── Teardown ──────────────────────────────────────────────────────────────

    async def on_unmount(self) -> None:
        await self._session.stop()
