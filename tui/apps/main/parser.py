"""Parse SVH PowerShell module files to extract function metadata."""

from __future__ import annotations

import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

DESTRUCTIVE_VERBS = frozenset([
    "Remove", "Block", "Reset", "Revoke", "Restart", "Stop",
])
WRITE_VERBS = frozenset([
    "New", "Set", "Start", "Enable", "Disable", "Add",
    "Unblock", "Invoke", "Repair",
])

_FUNC_RE = re.compile(r"^function\s+((?!script:)\S+)\s*\{", re.MULTILINE)
_EXPORT_RE = re.compile(r"Export-ModuleMember\s+-Function\s+([\w,\s\-]+)", re.IGNORECASE)


@dataclass
class PSParam:
    name: str
    type: str = "string"
    mandatory: bool = False
    is_switch: bool = False
    default: str = ""
    aliases: list[str] = field(default_factory=list)


@dataclass
class PSFunction:
    name: str
    module: str
    synopsis: str = ""
    example: str = ""
    params: list[PSParam] = field(default_factory=list)

    @property
    def verb(self) -> str:
        return self.name.split("-")[0] if "-" in self.name else ""

    @property
    def is_destructive(self) -> bool:
        return self.verb in DESTRUCTIVE_VERBS

    @property
    def is_write(self) -> bool:
        return self.verb in WRITE_VERBS

    @property
    def risk_level(self) -> str:
        if self.is_destructive:
            return "destructive"
        if self.is_write:
            return "write"
        return "read"


def parse_modules(modules_dir: Path) -> dict[str, list[PSFunction]]:
    """Return {module_name: [PSFunction]} for all SVH.*.psm1 files."""
    result: dict[str, list[PSFunction]] = {}
    for psm1 in sorted(modules_dir.glob("SVH.*.psm1")):
        funcs = _parse_module(psm1)
        if funcs:
            result[psm1.stem] = funcs
    return result


def _parse_module(path: Path) -> list[PSFunction]:
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        return []

    exported = _find_exports(content)
    functions: list[PSFunction] = []

    for m in _FUNC_RE.finditer(content):
        name = m.group(1)
        if name not in exported:
            continue
        body = _extract_block(content, m.end())
        synopsis, example = _parse_help(body)
        params = _parse_params(body)
        functions.append(PSFunction(
            name=name,
            module=path.stem,
            synopsis=synopsis,
            example=example,
            params=params,
        ))

    return sorted(functions, key=lambda f: f.name)


def _find_exports(content: str) -> set[str]:
    names: set[str] = set()
    for m in _EXPORT_RE.finditer(content):
        for name in re.findall(r"[\w\-]+", m.group(1)):
            if name and name not in ("Function", "Cmdlet"):
                names.add(name)
    return names


def _extract_block(content: str, start: int, max_chars: int = 15_000) -> str:
    """Extract function body from opening brace to matching close brace."""
    depth, i = 1, start
    limit = min(start + max_chars, len(content))
    while i < limit and depth > 0:
        c = content[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return content[start:i]


def _parse_help(body: str) -> tuple[str, str]:
    m = re.search(r"<#(.*?)#>", body, re.DOTALL)
    if not m:
        return "", ""
    text = m.group(1)

    synopsis = ""
    sm = re.search(r"\.SYNOPSIS\s+(.*?)(?=\n\s*\.\w|\Z)", text, re.DOTALL)
    if sm:
        synopsis = " ".join(sm.group(1).split())

    example = ""
    em = re.search(r"\.EXAMPLE\s+(.*?)(?=\n\s*\.\w|\Z)", text, re.DOTALL)
    if em:
        example = em.group(1).strip().split("\n")[0].strip()

    return synopsis, example


def _parse_params(body: str) -> list[PSParam]:
    pm = re.search(r"\bparam\s*\(", body, re.IGNORECASE)
    if not pm:
        return []

    start = pm.end() - 1
    depth, i = 0, start
    while i < len(body):
        if body[i] == "(":
            depth += 1
        elif body[i] == ")":
            depth -= 1
            if depth == 0:
                break
        i += 1

    block = body[start + 1 : i]
    return _split_params(block)


def _split_params(block: str) -> list[PSParam]:
    """Split on top-level commas."""
    segments: list[str] = []
    current: list[str] = []
    depth = 0

    for ch in block:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            seg = "".join(current).strip()
            if seg:
                segments.append(seg)
            current = []
        else:
            current.append(ch)

    seg = "".join(current).strip()
    if seg:
        segments.append(seg)

    return [p for seg in segments if (p := _parse_single_param(seg)) is not None]


def _parse_single_param(text: str) -> Optional[PSParam]:
    name_m = re.search(r"\$(\w+)", text)
    if not name_m:
        return None

    name = name_m.group(1)
    if name.lower() in ("null", "true", "false", "env", "global", "pscmdlet"):
        return None

    mandatory = bool(re.search(r"\[Parameter\([^)]*\bMandatory\b", text, re.IGNORECASE))

    # Last [Type] annotation immediately before $Name
    prefix = text[: name_m.start()].rstrip()
    type_m = re.search(r"\[([^\[\]]+)\]\s*$", prefix)
    param_type = "string"
    is_switch = False

    if type_m:
        raw = type_m.group(1).strip().lower()
        if raw == "switch":
            is_switch = True
            param_type = "switch"
        elif raw in ("bool", "boolean"):
            param_type = "bool"
        elif raw in ("int", "int32", "int64", "long", "uint32"):
            param_type = "int"
        elif "string" in raw:
            param_type = "string[]" if "[]" in raw else "string"
        else:
            param_type = raw

    # Default value after $Name
    default = ""
    suffix = text[name_m.end() :].strip()
    dm = re.match(r"=\s*(.+?)$", suffix, re.DOTALL)
    if dm:
        default = dm.group(1).strip().rstrip(",").strip()

    # Alias list
    aliases: list[str] = []
    am = re.search(r"\[Alias\(([^)]+)\)\]", text)
    if am:
        aliases = [a.strip().strip("'\"") for a in am.group(1).split(",")]

    return PSParam(
        name=name,
        type=param_type,
        mandatory=mandatory,
        is_switch=is_switch,
        default=default,
        aliases=aliases,
    )
