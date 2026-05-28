"""Write TUI command output to the Obsidian vault."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

VAULT = Path("/mnt/c/Users/astevens/vaults/OpsManVault")


def save_output(func_name: str, command: str, output: str) -> Path:
    """Write command output as an Investigation note. Returns the note path."""
    today = datetime.now().strftime("%Y-%m-%d")
    timestamp = datetime.now().strftime("%H%M%S")
    safe_name = func_name.replace("/", "-")

    note_dir = VAULT / "Investigations"
    note_dir.mkdir(parents=True, exist_ok=True)
    note_path = note_dir / f"{today}-{safe_name}-{timestamp}.md"

    content = f"""---
date: {today}
skill: powershell-tui
status: draft
tags: [powershell, investigation]
---

# {func_name}

**Command:** `{command}`
**Run at:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Output

```text
{output.strip()}
```
"""
    note_path.write_text(content, encoding="utf-8")
    return note_path
