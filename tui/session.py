"""Manage a persistent pwsh subprocess for the TUI."""

from __future__ import annotations

import asyncio
import uuid
from enum import Enum
from pathlib import Path


class SessionState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RUNNING = "running"
    ERROR = "error"


class PowerShellSession:
    # Unique sentinel so we know when each command's output ends
    _SENTINEL = f"SVH_TUI_{uuid.uuid4().hex}"

    def __init__(self, connect_script: Path) -> None:
        self._script = connect_script
        self._proc: asyncio.subprocess.Process | None = None
        self._lock = asyncio.Lock()
        self.state = SessionState.DISCONNECTED
        self.error: str = ""

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> str:
        """Start pwsh and dot-source connect.ps1. Returns startup output."""
        self.state = SessionState.CONNECTING
        try:
            self._proc = await asyncio.create_subprocess_exec(
                "pwsh",
                "-NoProfile",
                "-NonInteractive",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(self._script.parent),
            )
            # Silence progress bars during module load
            preamble = "$ProgressPreference = 'SilentlyContinue'\n"
            self._proc.stdin.write(preamble.encode())
            await self._proc.stdin.drain()

            out = await self._send(f'. "{self._script}"', timeout=120.0)
            self.state = SessionState.CONNECTED
            return out
        except Exception as exc:
            self.state = SessionState.ERROR
            self.error = str(exc)
            return f"STARTUP ERROR: {exc}"

    async def stop(self) -> None:
        if self._proc and self._proc.returncode is None:
            try:
                self._proc.stdin.write(b"exit\n")
                await self._proc.stdin.drain()
                await asyncio.wait_for(self._proc.wait(), timeout=5.0)
            except Exception:
                self._proc.kill()
        self.state = SessionState.DISCONNECTED

    # ── Command execution ─────────────────────────────────────────────────────

    async def run(self, command: str, timeout: float = 120.0) -> str:
        """Run a command in the live session and return its output."""
        if not self._proc or self._proc.returncode is not None:
            return "ERROR: Session is not running. Restart the TUI."
        async with self._lock:
            self.state = SessionState.RUNNING
            try:
                out = await self._send(command, timeout=timeout)
                self.state = SessionState.CONNECTED
                return out
            except asyncio.TimeoutError:
                self.state = SessionState.CONNECTED
                return f"ERROR: Command timed out after {timeout:.0f}s."
            except Exception as exc:
                self.state = SessionState.ERROR
                self.error = str(exc)
                return f"ERROR: {exc}"

    async def _send(self, command: str, timeout: float) -> str:
        sentinel = self._SENTINEL
        # Write command then sentinel so we know when output ends
        payload = f"{command}\nWrite-Output '{sentinel}'\n"
        self._proc.stdin.write(payload.encode("utf-8"))
        await self._proc.stdin.drain()

        lines: list[str] = []

        async def _read_until_done() -> None:
            while True:
                line = await self._proc.stdout.readline()
                text = line.decode("utf-8", errors="replace")
                if sentinel in text:
                    break
                lines.append(text)

        await asyncio.wait_for(_read_until_done(), timeout=timeout)
        return "".join(lines)

    # ── Status ────────────────────────────────────────────────────────────────

    @property
    def is_ready(self) -> bool:
        return self.state == SessionState.CONNECTED

    @property
    def status_label(self) -> str:
        return {
            SessionState.DISCONNECTED: "Disconnected",
            SessionState.CONNECTING: "Connecting…",
            SessionState.CONNECTED: "● Connected",
            SessionState.RUNNING: "● Running",
            SessionState.ERROR: "✗ Error",
        }.get(self.state, self.state.value)
