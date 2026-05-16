"""SVH PowerShell TUI — Textual application."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

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
    RadioButton,
    RadioSet,
    RichLog,
    Static,
    Tree,
)
from rich.text import Text

from .obsidian import save_output
from .parser import PSFunction, PSParam, parse_modules
from .session import PowerShellSession, SessionState

REPO_ROOT = Path(__file__).parent.parent
MODULES_DIR = REPO_ROOT / "powershell" / "modules"
CONNECT_SCRIPT = REPO_ROOT / "powershell" / "connect.ps1"

_RISK_COLOR = {"read": "green", "write": "yellow", "destructive": "red"}
_RISK_LABEL = {"read": "Read", "write": "Write", "destructive": "⚠ Destructive"}
_RISK_VARIANT = {"read": "success", "write": "warning", "destructive": "error"}


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

    def __init__(self, param: PSParam) -> None:
        super().__init__(classes="param-row")
        self._param = param

    def compose(self) -> ComposeResult:
        p = self._param
        suffix = ""
        if p.mandatory:
            suffix += " *"
        if p.type not in ("string", "switch"):
            suffix += f" [{p.type}]"
        if p.aliases:
            suffix += f"  ({', '.join(p.aliases[:2])})"

        yield Label(f"{p.name}{suffix}", classes="param-label")

        widget_id = f"param-{p.name}"
        if p.is_switch or p.type == "bool":
            yield Checkbox(
                "",
                id=widget_id,
                classes="param-input",
                value=p.default.lower() in ("$true", "true", "1"),
            )
        else:
            placeholder = p.default or ("required" if p.mandatory else "optional")
            yield Input(id=widget_id, placeholder=placeholder, classes="param-input")


# ── Main application ───────────────────────────────────────────────────────────

class SVHTui(App):
    """SVH PowerShell TUI — browse and run SVH module functions."""

    CSS_PATH = "app.tcss"
    TITLE = "SVH PowerShell TUI"
    BINDINGS = [
        ("ctrl+f", "focus_search", "Search"),
        ("ctrl+l", "clear_output", "Clear"),
        ("ctrl+r", "run_command", "Run"),
        ("ctrl+q", "quit", "Quit"),
        ("escape", "blur_input", "Blur"),
    ]

    selected_func: reactive[Optional[PSFunction]] = reactive(None)

    def __init__(self) -> None:
        super().__init__()
        self._modules: dict[str, list[PSFunction]] = {}
        self._all_funcs: list[PSFunction] = []
        self._session = PowerShellSession(CONNECT_SCRIPT)

    # ── Layout ────────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="main"):
            # Sidebar: search + function tree
            with Vertical(id="sidebar"):
                yield Input(placeholder="/ Search functions…", id="search")
                yield Tree("Modules", id="func-tree")

            # Right panel: detail + output
            with Vertical(id="right"):
                with VerticalScroll(id="detail"):
                    yield Static("Select a function from the sidebar →", id="func-name")
                    yield Static("", id="func-synopsis")
                    yield Static("", id="func-example")
                    yield Vertical(id="params-container")
                    yield Input(placeholder="Command preview (editable)", id="cmd-preview")
                    with Horizontal(id="actions-row"):
                        with RadioSet(id="output-dest"):
                            yield RadioButton("Console", value=True)
                            yield RadioButton("Obsidian")
                        yield Button("▶  Run", id="run-btn", variant="primary")

                with Vertical(id="output-section"):
                    yield RichLog(id="output-log", highlight=True, markup=True, wrap=True)

        yield Footer()

    # ── Startup ───────────────────────────────────────────────────────────────

    def on_mount(self) -> None:
        self._load_modules()
        self._start_session()

    def _load_modules(self) -> None:
        self._modules = parse_modules(MODULES_DIR)
        tree = self.query_one("#func-tree", Tree)
        tree.root.expand()
        for module_name, funcs in self._modules.items():
            node = tree.root.add(module_name, expand=False)
            for func in funcs:
                node.add_leaf(func.name, data=func)
            self._all_funcs.extend(funcs)

        n_funcs = len(self._all_funcs)
        n_mods = len(self._modules)
        self.sub_title = f"{n_funcs} functions · {n_mods} modules"

    @work
    async def _start_session(self) -> None:
        log = self.query_one("#output-log", RichLog)
        log.write(Text("Starting pwsh session and loading modules…", style="dim"))
        output = await self._session.start()

        if output.strip():
            for line in output.strip().splitlines():
                log.write(Text(line, style="dim"))

        if self._session.state == SessionState.CONNECTED:
            log.write(Text("✓ Session ready — all SVH modules loaded.", style="green bold"))
            self.sub_title = self.sub_title + "  |  ● Connected"
        else:
            log.write(Text(
                f"✗ Session failed: {self._session.error}\n"
                "Make sure BW_SESSION is set and pwsh is installed.",
                style="red bold",
            ))
            self.sub_title = self.sub_title + "  |  ✗ Session Error"

    # ── Function tree selection ────────────────────────────────────────────────

    def on_tree_node_selected(self, event: Tree.NodeSelected) -> None:
        func = event.node.data
        if isinstance(func, PSFunction):
            self.selected_func = func

    def watch_selected_func(self, func: Optional[PSFunction]) -> None:
        if func is not None:
            self.call_later(self._populate_detail, func)

    def _populate_detail(self, func: PSFunction) -> None:
        risk = func.risk_level
        color = _RISK_COLOR[risk]
        label = _RISK_LABEL[risk]

        self.query_one("#func-name", Static).update(
            f"[bold]{func.name}[/bold]  [{color}]{label}[/{color}]  [dim]{func.module}[/dim]"
        )
        self.query_one("#func-synopsis", Static).update(func.synopsis or "")
        self.query_one("#func-example", Static).update(
            f"[dim]e.g. {func.example}[/dim]" if func.example else ""
        )

        container = self.query_one("#params-container", Vertical)
        container.remove_children()
        if func.params:
            container.mount(*[ParamRow(p) for p in func.params])

        btn = self.query_one("#run-btn", Button)
        btn.variant = _RISK_VARIANT[risk]

        # Reset preview to bare function name; updates as user fills params
        self.query_one("#cmd-preview", Input).value = func.name

    # ── Search ────────────────────────────────────────────────────────────────

    @on(Input.Changed, "#search")
    def _on_search(self, event: Input.Changed) -> None:
        query = event.value.lower().strip()
        tree = self.query_one("#func-tree", Tree)

        # Rebuild tree content filtered by query
        tree.root.remove_children()
        for module_name, funcs in self._modules.items():
            matches = [
                f for f in funcs
                if not query
                or query in f.name.lower()
                or query in module_name.lower()
            ]
            if matches:
                node = tree.root.add(module_name, expand=bool(query))
                for f in matches:
                    node.add_leaf(f.name, data=f)

    # ── Param inputs → command preview ────────────────────────────────────────

    @on(Input.Changed)
    def _on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id not in ("search", "cmd-preview"):
            self._rebuild_preview()

    @on(Checkbox.Changed)
    def _on_checkbox_changed(self, _: Checkbox.Changed) -> None:
        self._rebuild_preview()

    def _rebuild_preview(self) -> None:
        func = self.selected_func
        if func is None:
            return
        cmd = self._build_command(func)
        preview = self.query_one("#cmd-preview", Input)
        if preview.value != cmd:
            preview.value = cmd

    def _build_command(self, func: PSFunction) -> str:
        parts = [func.name]
        for p in func.params:
            wid = f"param-{p.name}"
            try:
                if p.is_switch or p.type == "bool":
                    if self.query_one(f"#{wid}", Checkbox).value:
                        parts.append(f"-{p.name}")
                else:
                    val = self.query_one(f"#{wid}", Input).value.strip()
                    if val:
                        if p.type == "int":
                            parts.append(f"-{p.name} {val}")
                        else:
                            escaped = val.replace('"', '`"')
                            parts.append(f'-{p.name} "{escaped}"')
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
        func = self.selected_func
        if func is None:
            self._log("No function selected.", "dim")
            return

        # Validate mandatory non-switch params
        for p in func.params:
            if p.mandatory and not p.is_switch:
                try:
                    if not self.query_one(f"#param-{p.name}", Input).value.strip():
                        self._log(f"✗ Required parameter missing: -{p.name}", "red")
                        return
                except Exception:
                    pass

        command = self.query_one("#cmd-preview", Input).value.strip()
        if not command:
            return

        if func.is_destructive:
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

        # Optionally save to Obsidian
        dest = self.query_one("#output-dest", RadioSet)
        if dest.pressed_index == 1 and self.selected_func:
            try:
                note = save_output(self.selected_func.name, command, output)
                log.write(Text(f"→ Saved: {note.name}", style="green dim"))
            except Exception as exc:
                log.write(Text(f"→ Obsidian save failed: {exc}", style="yellow"))

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
