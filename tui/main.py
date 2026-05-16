"""Entry point: python -m tui  or  ./run-tui.sh"""

from __future__ import annotations

import os
import sys


def main() -> None:
    if not os.environ.get("BW_SESSION"):
        print(
            "BW_SESSION is not set.\n"
            "Unlock Bitwarden first:\n\n"
            "  export BW_SESSION=$(bw unlock --raw)\n",
            file=sys.stderr,
        )
        sys.exit(1)

    from .app import SVHTui

    SVHTui().run()


if __name__ == "__main__":
    main()
