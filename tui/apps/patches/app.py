"""SVH Patch Campaign Manager — Textual TUI application."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from rich.text import Text
from textual import on, work
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical
from textual.reactive import reactive
from textual.widgets import (
    Button,
    Footer,
    Header,
    Input,
    RichLog,
    Static,
    Tree,
)

from tui.apps.main.session import PowerShellSession, SessionState

REPO_ROOT = Path(__file__).parent.parent.parent.parent
CONNECT_SCRIPT = REPO_ROOT / "powershell" / "connect.ps1"

_SEV_COLOR = {
    "CRITICAL": "red",
    "IMPORTANT": "yellow",
    "MODERATE": "blue",
    "LOW": "dim",
    "OPTIONAL": "dim",
}

_SEV_RANK = {
    "CRITICAL": 0,
    "IMPORTANT": 1,
    "MODERATE": 2,
    "LOW": 3,
    "OPTIONAL": 4,
}

# Tree bucket node labels
_BUCKET_CRITICAL = "🔴 Critical"
_BUCKET_IMPORTANT = "🟡 Important"
_BUCKET_MODERATE = "🔵 Moderate"
_BUCKET_ALL = "All Servers"


def _parse_json_output(output: str) -> list[dict[str, Any]]:
    """Parse ConvertTo-Json output into a list of dicts (handles single object or array)."""
    text = output.strip()
    if not text or text.upper().startswith("ERROR"):
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return [parsed]
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass
    return []


def _top_severity(patches: list[dict[str, Any]]) -> str:
    """Return the highest-severity string from a patch list."""
    best_rank = 99
    best_sev = "LOW"
    for p in patches:
        sev = str(p.get("severity", p.get("Severity", "LOW"))).upper()
        rank = _SEV_RANK.get(sev, 99)
        if rank < best_rank:
            best_rank = rank
            best_sev = sev
    return best_sev


class PatchCampaign(App):
    """SVH Patch Campaign Manager — browse pending patches across the server fleet."""

    CSS_PATH = ["../../base.tcss", "app.tcss"]
    TITLE = "SVH Patch Campaign"

    BINDINGS = [
        ("ctrl+f", "focus_search", "Search"),
        ("ctrl+l", "clear_output", "Clear"),
        ("ctrl+r", "refresh_devices", "Refresh"),
        ("ctrl+q", "quit", "Quit"),
        ("escape", "blur_input", "Blur"),
    ]

    _selected_device: reactive[Optional[dict[str, Any]]] = reactive(None)

    def __init__(self) -> None:
        super().__init__()
        self._session = PowerShellSession(CONNECT_SCRIPT)
        # device_id → patch list (populated lazily on selection)
        self._patch_cache: dict[int, list[dict[str, Any]]] = {}
        # All loaded devices
        self._devices: list[dict[str, Any]] = []
        # Track pending fetch to avoid double-fires
        self._fetching_device_id: Optional[int] = None

    # ── Layout ────────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="main"):
            with Vertical(id="sidebar"):
                yield Input(placeholder="/ Search devices…", id="search")
                yield Tree("Devices", id="device-tree")

            with Vertical(id="right"):
                with Vertical(id="detail"):
                    yield Static(
                        "Select a device from the sidebar →",
                        id="device-title",
                    )
                    yield Static("", id="device-meta")
                    yield RichLog(
                        id="patch-list",
                        highlight=True,
                        markup=True,
                        wrap=True,
                    )
                    with Horizontal(id="detail-actions"):
                        yield Button("View History", id="btn-history")
                        yield Button("Cross-Ref TVM", id="btn-tvm")

                with Vertical(id="output-section"):
                    yield RichLog(
                        id="output-log",
                        highlight=True,
                        markup=True,
                        wrap=True,
                    )

        yield Footer()

    # ── Startup ───────────────────────────────────────────────────────────────

    def on_mount(self) -> None:
        tree = self.query_one("#device-tree", Tree)
        tree.root.expand()
        # Disable detail buttons until a device is selected
        self.query_one("#btn-history", Button).disabled = True
        self.query_one("#btn-tvm", Button).disabled = True
        self._start_session()

    @work
    async def _start_session(self) -> None:
        log = self.query_one("#output-log", RichLog)
        log.write(Text("Starting pwsh session and loading modules…", style="dim"))
        output = await self._session.start()

        if output.strip():
            for line in output.strip().splitlines():
                log.write(Text(line, style="dim"))
        log.scroll_end(animate=False)

        if self._session.state == SessionState.CONNECTED:
            log.write(Text("✓ Session ready — loading devices…", style="green bold"))
            log.scroll_end(animate=False)
            self.sub_title = "Loading devices…  |  ● Connected"
            self._load_devices()
        else:
            log.write(Text(
                f"✗ Session failed: {self._session.error}\n"
                "Make sure BW_SESSION is set and pwsh is installed.",
                style="red bold",
            ))
            log.scroll_end(animate=False)
            self.sub_title = "✗ Session Error"

    # ── Device loading ────────────────────────────────────────────────────────

    @work
    async def _load_devices(self) -> None:
        log = self.query_one("#output-log", RichLog)
        cmd = (
            "Get-SVHNinjaServers -OrgId 25 | "
            "Select-Object id,systemName,status,lastContact | "
            "ConvertTo-Json -Depth 3"
        )
        log.write(Text(f"\n❯ {cmd}", style="cyan bold"))
        log.scroll_end(animate=False)

        output = await self._session.run(cmd, timeout=120.0)

        if output.strip().upper().startswith("ERROR"):
            log.write(Text(output.rstrip(), style="red"))
            log.scroll_end(animate=False)
            self.sub_title = "Failed to load devices  |  ● Connected"
            return

        devices = _parse_json_output(output)

        if not devices:
            log.write(Text("(no devices returned)", style="dim"))
            log.scroll_end(animate=False)
            self.sub_title = "0 devices  |  ● Connected"
            return

        self._devices = devices
        self._rebuild_tree(devices)

        n = len(devices)
        log.write(Text(f"● {n} devices loaded", style="yellow bold"))
        log.scroll_end(animate=False)
        self.sub_title = f"{n} devices loaded  |  ● Connected"

    def _rebuild_tree(
        self,
        devices: list[dict[str, Any]],
        filter_text: str = "",
    ) -> None:
        """Rebuild the device tree. Puts all devices under All Servers initially."""
        tree = self.query_one("#device-tree", Tree)
        tree.root.remove_children()

        # Severity buckets — only shown once patches are known
        critical_node = tree.root.add(_BUCKET_CRITICAL, expand=True)
        important_node = tree.root.add(_BUCKET_IMPORTANT, expand=True)
        moderate_node = tree.root.add(_BUCKET_MODERATE, expand=False)
        all_node = tree.root.add(_BUCKET_ALL, expand=True)

        q = filter_text.lower().strip()

        placed_in_bucket: set[int] = set()

        for dev in sorted(devices, key=lambda d: d.get("systemName", "").lower()):
            name = dev.get("systemName", f"device-{dev.get('id', '?')}")
            dev_id = int(dev.get("id", 0))

            if q and q not in name.lower():
                continue

            patches = self._patch_cache.get(dev_id)
            if patches is not None:
                n_patches = len(patches)
                label = f"{name}  [{n_patches}]" if n_patches else f"{name}  ✓"
                top_sev = _top_severity(patches) if patches else ""

                if top_sev == "CRITICAL":
                    critical_node.add_leaf(label, data=dev)
                    placed_in_bucket.add(dev_id)
                elif top_sev == "IMPORTANT":
                    important_node.add_leaf(label, data=dev)
                    placed_in_bucket.add(dev_id)
                elif top_sev in ("MODERATE",):
                    moderate_node.add_leaf(label, data=dev)
                    placed_in_bucket.add(dev_id)
            else:
                label = name

            all_node.add_leaf(label, data=dev)

        # Expand buckets that have children; collapse empty ones
        critical_node.expand()
        important_node.expand()

    # ── Search ────────────────────────────────────────────────────────────────

    @on(Input.Changed, "#search")
    def _on_search(self, event: Input.Changed) -> None:
        if self._devices:
            self._rebuild_tree(self._devices, filter_text=event.value)

    # ── Device selection ──────────────────────────────────────────────────────

    def on_tree_node_selected(self, event: Tree.NodeSelected) -> None:
        data = event.node.data
        if not isinstance(data, dict) or "id" not in data:
            return
        self._selected_device = data
        dev_id = int(data["id"])

        if dev_id in self._patch_cache:
            self._show_device_detail(data, self._patch_cache[dev_id])
        else:
            if self._fetching_device_id != dev_id:
                self._fetching_device_id = dev_id
                self._fetch_patches(dev_id, data.get("systemName", str(dev_id)))

    def _show_device_detail(
        self,
        device: dict[str, Any],
        patches: list[dict[str, Any]],
    ) -> None:
        name = device.get("systemName", "Unknown")
        status = device.get("status", "unknown")
        last_contact = device.get("lastContact", "—")
        n_patches = len(patches)

        # Title
        self.query_one("#device-title", Static).update(
            f"[bold]{name}[/bold]  "
            f"[dim]{n_patches} pending patch{'es' if n_patches != 1 else ''}[/dim]"
        )

        # Meta
        self.query_one("#device-meta", Static).update(
            f"Status: {status}  Last contact: {last_contact}"
        )

        # Patch list
        patch_log = self.query_one("#patch-list", RichLog)
        patch_log.clear()

        if not patches:
            patch_log.write(Text("(no pending patches — up to date)", style="green dim"))
        else:
            for p in patches:
                patch_name = p.get("name", p.get("patchName", p.get("Name", "Unknown patch")))
                kb = p.get("kbNumber", p.get("KbNumber", p.get("kb", "")))
                sev_raw = str(p.get("severity", p.get("Severity", "LOW"))).upper()
                color = _SEV_COLOR.get(sev_raw, "white")
                sev_label = sev_raw.capitalize()
                kb_str = f"  [dim]{kb}[/dim]" if kb else ""
                patch_log.write(
                    Text.from_markup(
                        f"[{color}]{sev_label}[/{color}]  {patch_name}{kb_str}"
                    )
                )

        patch_log.scroll_end(animate=False)

        # Enable action buttons
        self.query_one("#btn-history", Button).disabled = False
        self.query_one("#btn-tvm", Button).disabled = False

        # Update subtitle
        n_devs = len(self._devices)
        self.sub_title = f"{n_devs} devices  |  {name}: {n_patches} pending"

    # ── Patch fetching (lazy) ─────────────────────────────────────────────────

    @work
    async def _fetch_patches(self, device_id: int, device_name: str) -> None:
        log = self.query_one("#output-log", RichLog)
        patch_log = self.query_one("#patch-list", RichLog)

        # Show loading state in detail panel
        self.query_one("#device-title", Static).update(
            f"[bold]{device_name}[/bold]  [dim]Loading patches…[/dim]"
        )
        self.query_one("#device-meta", Static).update("")
        patch_log.clear()
        patch_log.write(Text("Fetching patches…", style="dim"))

        cmd = f"Get-SVHNinjaPatches -DeviceId {device_id} | ConvertTo-Json -Depth 5"
        log.write(Text(f"\n❯ {cmd}", style="cyan bold"))
        log.scroll_end(animate=False)

        output = await self._session.run(cmd, timeout=120.0)

        if output.strip().upper().startswith("ERROR"):
            log.write(Text(output.rstrip(), style="red"))
            log.scroll_end(animate=False)
            patch_log.clear()
            patch_log.write(Text(output.rstrip(), style="red"))
            patch_log.scroll_end(animate=False)
            self._fetching_device_id = None
            return

        patches = _parse_json_output(output)
        self._patch_cache[device_id] = patches
        self._fetching_device_id = None

        n = len(patches)
        if n:
            log.write(Text(f"● {n} patch{'es' if n != 1 else ''} pending", style="yellow bold"))
        else:
            log.write(Text("(no pending patches — up to date)", style="green dim"))
        log.scroll_end(animate=False)

        # Update detail if this device is still the selected one
        if self._selected_device and int(self._selected_device.get("id", -1)) == device_id:
            self._show_device_detail(self._selected_device, patches)

        # Rebuild tree to place device in correct severity bucket
        if self._devices:
            search = self.query_one("#search", Input).value
            self._rebuild_tree(self._devices, filter_text=search)

    # ── Action buttons ────────────────────────────────────────────────────────

    @on(Button.Pressed, "#btn-history")
    def _on_history(self, _: Button.Pressed) -> None:
        dev = self._selected_device
        if dev:
            self._run_history(int(dev["id"]))

    @on(Button.Pressed, "#btn-tvm")
    def _on_tvm(self, _: Button.Pressed) -> None:
        self._run_tvm()

    @work
    async def _run_history(self, device_id: int) -> None:
        log = self.query_one("#output-log", RichLog)
        cmd = f"Get-SVHNinjaPatchHistory -DeviceId {device_id}"
        log.write(Text(f"\n❯ {cmd}", style="cyan bold"))
        log.scroll_end(animate=False)

        output = await self._session.run(cmd, timeout=120.0)

        if not output.strip():
            log.write(Text("(no output)", style="dim"))
        elif output.lstrip().startswith("ERROR"):
            log.write(Text(output.rstrip(), style="red"))
        else:
            log.write(Text(output.rstrip()))
        log.scroll_end(animate=False)

    @work
    async def _run_tvm(self) -> None:
        log = self.query_one("#output-log", RichLog)
        cmd = "Get-SVHTVMRecommendations | ConvertTo-Json -Depth 3"
        log.write(Text(f"\n❯ {cmd}", style="cyan bold"))
        log.scroll_end(animate=False)

        output = await self._session.run(cmd, timeout=120.0)

        if not output.strip():
            log.write(Text("(no output)", style="dim"))
        elif output.lstrip().startswith("ERROR"):
            log.write(Text(output.rstrip(), style="red"))
        else:
            log.write(Text(output.rstrip()))
        log.scroll_end(animate=False)

    # ── Keybinding actions ────────────────────────────────────────────────────

    def action_focus_search(self) -> None:
        self.query_one("#search", Input).focus()

    def action_clear_output(self) -> None:
        self.query_one("#output-log", RichLog).clear()

    def action_refresh_devices(self) -> None:
        log = self.query_one("#output-log", RichLog)
        if not self._session.is_ready:
            log.write(Text("✗ Session not ready — cannot refresh", style="red"))
            log.scroll_end(animate=False)
            return
        self._patch_cache.clear()
        self._devices = []
        self._selected_device = None
        self._fetching_device_id = None
        tree = self.query_one("#device-tree", Tree)
        tree.root.remove_children()
        self.query_one("#device-title", Static).update(
            "Select a device from the sidebar →"
        )
        self.query_one("#device-meta", Static).update("")
        self.query_one("#patch-list", RichLog).clear()
        self.query_one("#btn-history", Button).disabled = True
        self.query_one("#btn-tvm", Button).disabled = True
        self.sub_title = "Refreshing…  |  ● Connected"
        self._load_devices()

    def action_blur_input(self) -> None:
        focused = self.focused
        if isinstance(focused, Input):
            focused.blur()

    def _log(self, msg: str, style: str = "white") -> None:
        log = self.query_one("#output-log", RichLog)
        log.write(Text(msg, style=style))
        log.scroll_end(animate=False)

    # ── Teardown ──────────────────────────────────────────────────────────────

    async def on_unmount(self) -> None:
        await self._session.stop()
