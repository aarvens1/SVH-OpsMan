#!/usr/bin/env bash
# Audit skill coverage: Claude skill dirs vs vault skill pages vs PowerShell companions.
# Usage: ./scripts/audit-skills.sh [--json]

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$REPO/.claude/skills"
VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"
VAULT_SKILLS="$VAULT/Skills"
PS_MODULES="$REPO/powershell/modules"
JSON="${1:-}"

# Collect PS functions once
PS_FUNCTIONS="$(grep -rh -oP "(Get|New|Set)-SVH\w+" "$PS_MODULES" --include="*.psm1" 2>/dev/null | sort -u)"

missing_page=()
missing_ps=()
ok=()

for skill_dir in "$SKILLS_DIR"/*/; do
    name="$(basename "$skill_dir")"

    # Skip disabled skills
    [[ -f "$skill_dir/SKILL.md.disabled" && ! -f "$skill_dir/SKILL.md" ]] && continue

    # Check vault page (case-insensitive match)
    page_file=""
    for candidate in "$VAULT_SKILLS/$name.md" "$VAULT_SKILLS/$(tr '[:lower:]' '[:upper:]' <<< "${name:0:1}")${name:1}.md"; do
        [[ -f "$candidate" ]] && { page_file="$candidate"; break; }
    done

    # Check PS companions — look for any function whose name loosely maps to the skill name.
    # Strategy: convert skill name to PascalCase noun and grep for Get/New/Set-SVH<noun>
    noun="$(echo "$name" | sed -E 's/(^|-)(.)([^-]*)/\U\2\L\3/g; s/-//g')"
    ps_match="$(echo "$PS_FUNCTIONS" | grep -i "$noun" | head -3 || true)"

    if [[ -z "$page_file" && -z "$ps_match" ]]; then
        missing_page+=("$name:both")
    elif [[ -z "$page_file" ]]; then
        missing_page+=("$name:page")
    elif [[ -z "$ps_match" ]]; then
        missing_ps+=("$name:ps")
    else
        ok+=("$name")
    fi
done

if [[ "$JSON" == "--json" ]]; then
    echo "{"
    echo '  "missing_vault_page_and_ps": ['
    for e in "${missing_page[@]:-}"; do
        [[ "$e" == *:both ]] && echo "    \"${e%:both}\","
    done | sed '$ s/,$//'
    echo "  ],"
    echo '  "missing_vault_page_only": ['
    for e in "${missing_page[@]:-}"; do
        [[ "$e" == *:page ]] && echo "    \"${e%:page}\","
    done | sed '$ s/,$//'
    echo "  ],"
    echo '  "missing_ps_companion_only": ['
    for e in "${missing_ps[@]:-}"; do
        echo "    \"${e%:ps}\","
    done | sed '$ s/,$//'
    echo "  ],"
    echo '  "ok": ['
    printf '    "%s",\n' "${ok[@]:-}" | sed '$ s/,$//'
    echo "  ]"
    echo "}"
    exit 0
fi

total_skills=$(( ${#missing_page[@]} + ${#missing_ps[@]} + ${#ok[@]} ))
echo "=== Skill coverage audit ($(date +%Y-%m-%d)) ==="
echo "Total active skills: $total_skills"
echo ""

echo "--- Missing BOTH vault page AND PS companion (${#missing_page[@]} — prioritize these) ---"
for e in "${missing_page[@]:-}"; do
    [[ "$e" == *:both ]] && echo "  ✗ ${e%:both}"
done
echo ""

echo "--- Missing vault page only ---"
for e in "${missing_page[@]:-}"; do
    [[ "$e" == *:page ]] && echo "  ✗ ${e%:page}"
done
echo ""

echo "--- Missing PS companion only ---"
for e in "${missing_ps[@]:-}"; do
    echo "  ~ ${e%:ps}"
done
echo ""

echo "--- Fully covered ---"
if [[ ${#ok[@]} -eq 0 ]]; then
    echo "  (none — all skills have at least one gap)"
else
    for e in "${ok[@]}"; do
        echo "  ✓ $e"
    done
fi
