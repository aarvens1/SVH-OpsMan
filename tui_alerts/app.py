"""SVH Alert Triage TUI — Textual application."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from textual import on, work
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.reactive import reactive
from textual.widgets import (
    Button,
    Footer,
    Header,
    Input,
    Label,
    RichLog,
    Static,
    Tree,
)
from rich.text import Text

from tui.session import PowerShellSession, SessionState

CONNECT_SCRIPT = Path(__file__).parent.parent / "powershell" / "connect.ps1"

# ── Alert source definitions ──────────────────────────────────────────────────

ALERT_SOURCES = [
    {
        "group": "Wazuh",
        "items": [
            {
                "label": "High Alerts (12+, 24h)",
                "source": "Wazuh",
                "cmd": "Get-SVHWazuhHighAlerts",
                "synopsis": "Wazuh alerts at rule level 12 or above in the last 24 hours.",
                "risk": "read",
                "params": [
                    {"name": "MinLevel", "type": "int", "default": "12", "mandatory": False, "desc": "Minimum rule level"},
                    {"name": "Hours",    "type": "int", "default": "24", "mandatory": False, "desc": "Look-back window (hours)"},
                    {"name": "Limit",    "type": "int", "default": "200", "mandatory": False, "desc": "Max results"},
                ],
            },
            {
                "label": "Auth Failures (24h)",
                "source": "Wazuh",
                "cmd": "Get-SVHWazuhAuthFailures",
                "synopsis": "Authentication failure events from Wazuh in the last 24 hours.",
                "risk": "read",
                "params": [
                    {"name": "Hours", "type": "int", "default": "24",  "mandatory": False, "desc": "Look-back window (hours)"},
                    {"name": "Limit", "type": "int", "default": "100", "mandatory": False, "desc": "Max results"},
                ],
            },
            {
                "label": "Disconnected Agents",
                "source": "Wazuh",
                "cmd": "Get-SVHWazuhDisconnectedAgents",
                "synopsis": "Wazuh agents currently in disconnected state.",
                "risk": "read",
                "params": [
                    {"name": "Limit", "type": "int", "default": "100", "mandatory": False, "desc": "Max results"},
                ],
            },
        ],
    },
    {
        "group": "NinjaOne",
        "items": [
            {
                "label": "Critical Alerts",
                "source": "NinjaOne",
                "cmd": "Get-SVHNinjaCriticalAlerts",
                "synopsis": "Active critical-severity alerts from NinjaOne.",
                "risk": "read",
                "params": [],
            },
            {
                "label": "Offline Devices",
                "source": "NinjaOne",
                "cmd": "Get-SVHNinjaOfflineDevices",
                "synopsis": "Devices currently showing as offline in NinjaOne.",
                "risk": "read",
                "params": [],
            },
            {
                "label": "Disk Alerts (>85%)",
                "source": "NinjaOne",
                "cmd": "Get-SVHNinjaDiskAlerts",
                "synopsis": "Devices with disk utilization above threshold (default 85%).",
                "risk": "read",
                "params": [
                    {"name": "Threshold", "type": "int", "default": "85", "mandatory": False, "desc": "Disk usage % threshold"},
                ],
            },
        ],
    },
    {
        "group": "Cross-System",
        "items": [
            {
                "label": "Critical Summary",
                "source": "Cross",
                "cmd": "Get-SVHCriticalAlertSummary",
                "synopsis": "Cross-system roll-up of critical alerts from all integrated sources.",
                "risk": "read",
                "params": [],
            },
        ],
    },
]

# Commands that emit Wazuh-style alert JSON (agent/rule/timestamp)
_WAZUH_ALERT_CMDS = {"Get-SVHWazuhHighAlerts", "Get-SVHWazuhAuthFailures"}
# Commands that emit NinjaOne offline device JSON
_NINJA_OFFLINE_CMDS = {"Get-SVHNinjaOfflineDevices"}
# Commands whose output is already human-readable (no reformatting needed)
_PLAIN_CMDS = {"Get-SVHCriticalAlertSummary"}


# ── Main application ──────────────────────────────────────────────────────────

class AlertTriage(App):
    """SVH Alert Triage — real-time security alert browser."""

    CSS_PATH = ["../tui/base.tcss", "app.tcss"]
    TITLE = "SVH Alert Triage"
    BINDINGS = [
        ("ctrl+f", "focus_search",       "Search"),
        ("ctrl+l", "clear_output",       "Clear"),
        ("ctrl+r", "refresh_selected",   "Refresh"),
        ("ctrl+q", "quit",               "Quit"),
        ("escape", "blur_input",         "Blur"),
    ]

    # Currently selected alert definition dict
    selected_alert: reactive[Optional[dict]] = reactive(None)

    def __init__(self) -> None:
        super().__init__()
        self._session = PowerShellSession(CONNECT_SCRIPT)
        self._auto_active: bool = False
        self._auto_timer = None
        # Track param Input widget IDs for the current selection
        self._param_input_ids: list[str] = []

    # ── Layout ────────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)

        with Horizontal(id="main"):
            # Sidebar
            with Vertical(id="sidebar"):
                yield Input(placeholder="/ Filter alerts…", id="search")
                yield Tree("Alert Sources", id="source-tree")

            # Right panel
            with Vertical(id="right"):
                # Detail section
                with Vertical(id="detail"):
                    yield Static("Select an alert source from the sidebar →", id="alert-title")
                    yield Static("", id="alert-meta")
                    with Horizontal(id="filter-row"):
                        pass  # param inputs populated dynamically
                    with Horizontal(id="action-row"):
                        yield Button("▶  Fetch", id="fetch-btn", variant="success")
                        yield Button("⟳ Auto",  id="auto-btn",  variant="default")

                # Output section
                with Vertical(id="output-section"):
                    yield RichLog(id="output-log", highlight=True, markup=True, wrap=True)

        yield Footer()

    # ── Startup ───────────────────────────────────────────────────────────────

    def on_mount(self) -> None:
        self._build_tree()
        self._start_session()

    def _build_tree(self) -> None:
        tree = self.query_one("#source-tree", Tree)
        tree.root.expand()
        for group_def in ALERT_SOURCES:
            group_node = tree.root.add(group_def["group"], expand=True)
            for item in group_def["items"]:
                group_node.add_leaf(item["label"], data=item)

        total = sum(len(g["items"]) for g in ALERT_SOURCES)
        self.sub_title = f"{total} alert sources  |  Connecting…"

    @work
    async def _start_session(self) -> None:
        log = self.query_one("#output-log", RichLog)
        log.write(Text("Starting pwsh session and loading SVH modules…", style="dim"))
        output = await self._session.start()

        if output.strip():
            for line in output.strip().splitlines():
                log.write(Text(line, style="dim"))

        total = sum(len(g["items"]) for g in ALERT_SOURCES)
        if self._session.state == SessionState.CONNECTED:
            log.write(Text("✓ Session ready.", style="green bold"))
            self.sub_title = f"{total} alert sources  |  ● Connected"
        else:
            log.write(Text(
                f"✗ Session failed: {self._session.error}\n"
                "Make sure BW_SESSION is set and pwsh is installed.",
                style="red bold",
            ))
            self.sub_title = f"{total} alert sources  |  ✗ Session Error"

    # ── Tree selection ────────────────────────────────────────────────────────

    def on_tree_node_selected(self, event: Tree.NodeSelected) -> None:
        data = event.node.data
        if isinstance(data, dict) and "cmd" in data:
            self.selected_alert = data

    def watch_selected_alert(self, alert: Optional[dict]) -> None:
        if alert is not None:
            self.call_later(self._populate_detail, alert)

    def _populate_detail(self, alert: dict) -> None:
        self.query_one("#alert-title", Static).update(
            f"[bold]{alert['label']}[/bold]  [dim]{alert['source']} Module[/dim]"
        )
        self.query_one("#alert-meta", Static).update(alert["synopsis"])

        # Rebuild filter row
        filter_row = self.query_one("#filter-row", Horizontal)
        filter_row.remove_children()

        self._param_input_ids = []
        widgets = []
        for p in alert.get("params", []):
            wid = f"fp-{p['name']}"
            self._param_input_ids.append(wid)
            widgets.append(Label(f"{p['name']}:", classes="filter-label"))
            widgets.append(
                Input(
                    value=p["default"],
                    id=wid,
                    classes="filter-input",
                )
            )

        if widgets:
            filter_row.mount(*widgets)

    # ── Search / filter tree ──────────────────────────────────────────────────

    @on(Input.Changed, "#search")
    def _on_search(self, event: Input.Changed) -> None:
        query = event.value.lower().strip()
        tree = self.query_one("#source-tree", Tree)
        tree.root.remove_children()

        for group_def in ALERT_SOURCES:
            matches = [
                item for item in group_def["items"]
                if not query
                or query in item["label"].lower()
                or query in group_def["group"].lower()
                or query in item["cmd"].lower()
            ]
            if matches:
                group_node = tree.root.add(group_def["group"], expand=True)
                for item in matches:
                    group_node.add_leaf(item["label"], data=item)

    # ── Fetch / Run ───────────────────────────────────────────────────────────

    @on(Button.Pressed, "#fetch-btn")
    def _on_fetch_pressed(self, _: Button.Pressed) -> None:
        self._handle_fetch()

    def action_refresh_selected(self) -> None:
        self._handle_fetch()

    def _handle_fetch(self) -> None:
        alert = self.selected_alert
        if alert is None:
            self._log("No alert source selected.", "dim")
            return
        command = self._build_command(alert)
        self._execute(command)

    def _build_command(self, alert: dict) -> str:
        parts = [alert["cmd"]]
        for p in alert.get("params", []):
            wid = f"fp-{p['name']}"
            try:
                val = self.query_one(f"#{wid}", Input).value.strip()
            except Exception:
                val = p["default"]
            if val and val != p["default"]:
                parts.append(f"-{p['name']} {val}")
            elif val:
                # Always pass all params explicitly so defaults are clear
                parts.append(f"-{p['name']} {val}")
        return " ".join(parts)

    @work
    async def _execute(self, command: str) -> None:
        btn = self.query_one("#fetch-btn", Button)
        log = self.query_one("#output-log", RichLog)

        btn.disabled = True
        log.write(Text(f"\n❯ {command}", style="cyan bold"))

        full_cmd = f"{command} | ConvertTo-Json -Depth 5"
        output = await self._session.run(full_cmd)

        btn.disabled = False

        if not output.strip():
            log.write(Text("(no results — all clear)", style="green dim"))
            log.scroll_end(animate=False)
            return

        if output.lstrip().startswith("ERROR:"):
            log.write(Text(output.rstrip(), style="red"))
            log.scroll_end(animate=False)
            return

        alert = self.selected_alert
        cmd_name = alert["cmd"] if alert else ""

        # Plain-text commands — write directly
        if cmd_name in _PLAIN_CMDS:
            log.write(Text(output.rstrip()))
            log.scroll_end(animate=False)
            return

        # Attempt JSON parse
        try:
            data = json.loads(output.strip())
        except json.JSONDecodeError:
            # Fall back to raw text
            log.write(Text(output.rstrip()))
            log.scroll_end(animate=False)
            return

        # Normalise to list
        if isinstance(data, dict):
            data = [data]

        if not data:
            log.write(Text("(no results — all clear)", style="green dim"))
            log.scroll_end(animate=False)
            return

        log.write(Text(f"● {len(data)} results", style="yellow bold"))

        if cmd_name in _WAZUH_ALERT_CMDS:
            self._render_wazuh_alerts(log, data)
        elif cmd_name in _NINJA_OFFLINE_CMDS:
            self._render_ninja_offline(log, data)
        else:
            # Generic pretty-print
            self._render_generic(log, data)

        log.scroll_end(animate=False)

    # ── Alert renderers ───────────────────────────────────────────────────────

    def _render_wazuh_alerts(self, log: RichLog, items: list) -> None:
        for item in items:
            try:
                level = item.get("rule", {}).get("level", "?")
                desc  = item.get("rule", {}).get("description", "")
                agent = item.get("agent", {}).get("name", item.get("agent", {}).get("id", "?"))
                ts    = item.get("timestamp", "")
                # Trim timestamp to readable portion
                ts_short = ts[:19].replace("T", " ") if ts else ""
                level_style = "red" if isinstance(level, int) and level >= 12 else "yellow"
                line = Text()
                line.append(f"L{level}", style=level_style + " bold")
                line.append(f"  {agent}", style="white bold")
                if desc:
                    line.append(f"  {desc}", style="dim")
                if ts_short:
                    line.append(f"  {ts_short}", style="#928374")
                log.write(line)
            except Exception:
                log.write(Text(str(item), style="dim"))

    def _render_ninja_offline(self, log: RichLog, items: list) -> None:
        for item in items:
            try:
                name    = item.get("systemName", item.get("id", "?"))
                last_c  = item.get("lastContact", "unknown")
                line = Text()
                line.append("✗", style="yellow bold")
                line.append(f"  {name}", style="white bold")
                line.append(f"  last: {last_c}", style="dim")
                log.write(line)
            except Exception:
                log.write(Text(str(item), style="dim"))

    def _render_generic(self, log: RichLog, items: list) -> None:
        for item in items:
            if isinstance(item, dict):
                for k, v in item.items():
                    log.write(Text(f"  {k}: {v}", style="#d5c4a1"))
                log.write(Text("  ─" * 20, style="#504945"))
            else:
                log.write(Text(str(item)))

    # ── Auto-refresh ──────────────────────────────────────────────────────────

    @on(Button.Pressed, "#auto-btn")
    def _toggle_auto(self, _: Button.Pressed) -> None:
        btn = self.query_one("#auto-btn", Button)
        if self._auto_active:
            # Stop
            if self._auto_timer is not None:
                self._auto_timer.stop()
                self._auto_timer = None
            self._auto_active = False
            btn.variant = "default"
            btn.label = "⟳ Auto"
        else:
            # Start
            self._auto_active = True
            btn.variant = "success"
            btn.label = "⟳ On"
            self._auto_timer = self.set_interval(60, self._auto_refresh)
            # Run immediately on enable
            self._handle_fetch()

    def _auto_refresh(self) -> None:
        if self._auto_active and self.selected_alert is not None:
            self._handle_fetch()

    # ── Keybind actions ───────────────────────────────────────────────────────

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
        if self._auto_timer is not None:
            self._auto_timer.stop()
        await self._session.stop()
