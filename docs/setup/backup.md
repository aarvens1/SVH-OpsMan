# Backup Setup

WSL home is backed up nightly via rclone and a systemd timer. OneDrive (primary) covers everything; Google Drive covers the vault only as a second copy.

**What's backed up:**

| Target | OneDrive | Google Drive |
|--------|----------|--------------|
| `/mnt/c/Users/astevens/vaults/OpsManVault/` | ✓ | ✓ |
| `~/.ssh/` | ✓ | — |
| `~/.config/` | ✓ | — |
| `~/SVH-OpsMan/db/` | ✓ | — |
| `~/.zshrc`, `.gitconfig`, etc. | ✓ | — |

The GitHub repo covers all code. Bitwarden is self-hosted in their cloud. Nothing else needs backing up.

---

## Step 1 — Install rclone

```bash
sudo apt install rclone
```

Verify: `rclone --version`

---

## Step 2 — Configure OneDrive remote

```bash
rclone config
```

When prompted:
1. `n` — new remote
2. Name: `onedrive`
3. Storage type: `onedrive` (Microsoft OneDrive)
4. Client ID / Secret: leave blank (uses rclone's shared app)
5. Follow the OAuth flow — it will print a URL, open it in your Windows browser, and paste the code back
6. Account type: `onedrive` (personal or business)
7. Select the drive to use (your work OneDrive)
8. Confirm and `y` to save

Test: `rclone ls onedrive:` — should list your OneDrive root.

---

## Step 3 — Configure Google Drive remote

```bash
rclone config
```

When prompted:
1. `n` — new remote
2. Name: `gdrive`
3. Storage type: `drive` (Google Drive)
4. Client ID / Secret: leave blank
5. Scope: `drive` (full access)
6. Follow the OAuth flow — open the URL in your browser (use the personal `astevens2694@gmail.com` account)
7. Confirm and `y` to save

Test: `rclone ls gdrive:` — should list your Google Drive root.

---

## Step 4 — Run a manual test

```bash
~/SVH-OpsMan/scripts/backup.sh
```

Check OneDrive for a `Backups/WSL/` folder and Google Drive for `Backups/OpsManVault/`.

---

## Step 5 — Enable the systemd timer

`setup.sh` installs and enables the timer automatically. If running manually:

```bash
cp ~/SVH-OpsMan/systemd/user/svh-opsman-backup.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now svh-opsman-backup.timer
systemctl --user list-timers svh-opsman-backup.timer
```

Logs: `journalctl --user -u svh-opsman-backup` or `~/.local/share/svh-opsman/backup-YYYY-MM-DD.log`

---

## Obsidian vault path

The vault lives at `/mnt/c/Users/astevens/vaults/OpsManVault/`. Open it in Obsidian via:

```
C:\Users\astevens\vaults\OpsManVault
```

In Obsidian: **Open folder as vault** → navigate to that path.
