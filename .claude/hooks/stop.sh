#!/usr/bin/env bash
# Runs when Claude finishes responding. Warns if BW_SESSION is unset.

if [ -z "${BW_SESSION:-}" ]; then
  echo "⚠  BW_SESSION not set — run: bwu" >&2
fi
