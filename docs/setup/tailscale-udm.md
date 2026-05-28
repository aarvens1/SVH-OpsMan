# Tailscale on UDM Pro / UDM SE — Subnet Router Setup

Each UDM at an SVH site becomes a Tailscale subnet router. Devices on the local
network don't need Tailscale installed — traffic routes through the UDM's node.
From your WSL box you can reach any device at any site by IP.

## Prerequisites

- UDM Pro, UDM SE, or UDM Pro Max (UniFi OS 3.x+)
- SSH access to each UDM (admin credentials)
- Your tailnet already has at least one node (WSL box)

---

## Step 1 — Install unifios-utilities (on-boot persistence)

UniFi OS firmware updates wipe `/usr/local/sbin/` and similar paths. The
`unifios-utilities` project installs a boot hook that re-runs your setup on
every reboot/update.

SSH into the UDM:

```bash
ssh root@<udm-ip>
```

Install the on-boot-script:

```bash
curl -fsL https://raw.githubusercontent.com/unifi-utilities/unifios-utilities/HEAD/on-boot-script-2.x/remote_install.sh | /bin/sh
```

Verify:

```bash
systemctl status on-boot-script
```

---

## Step 2 — Install Tailscale

Still on the UDM via SSH:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

If the install script doesn't detect the OS correctly (some UDM Pro versions):

```bash
# Manual Debian arm64 install
curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg \
  | tee /usr/share/keyrings/tailscale-archive-keyring.gpg > /dev/null
curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list \
  | tee /etc/apt/sources.list.d/tailscale.list
apt-get update && apt-get install -y tailscale
```

---

## Step 3 — Bring up as subnet router

Advertise the subnets this UDM routes. Adjust CIDRs for each site:

```bash
# Example: main office with two VLANs
tailscale up \
  --advertise-routes=10.0.10.0/24,10.0.20.0/24,10.0.30.0/24 \
  --accept-dns=false \
  --hostname=udm-<sitename>
```

- `--advertise-routes`: all VLANs/subnets at this site
- `--accept-dns=false`: keep the UDM using its own DNS, not Tailscale's
- `--hostname`: something identifiable per site (udm-main, udm-warehouse, etc.)

Authenticate via the URL that appears in the terminal.

---

## Step 4 — Approve routes in the admin console

Advertised routes require explicit approval before they're active:

1. Go to [Tailscale admin console](https://login.tailscale.com/admin/machines)
2. Find the UDM node → Edit route settings
3. Enable each advertised subnet
4. Disable key expiry on the UDM node

---

## Step 5 — Persist across firmware updates

Create an on-boot script so Tailscale starts automatically after every UDM reboot
or firmware update:

```bash
cat > /data/on_boot.d/10-tailscale.sh <<'EOF'
#!/bin/sh
/usr/sbin/tailscaled --state=/var/lib/tailscale/tailscaled.state &
sleep 5
/usr/sbin/tailscale up \
  --advertise-routes=10.0.10.0/24,10.0.20.0/24,10.0.30.0/24 \
  --accept-dns=false \
  --hostname=udm-<sitename>
EOF

chmod +x /data/on_boot.d/10-tailscale.sh
```

The Tailscale state file lives in `/var/lib/tailscale/` which persists across
firmware updates on UniFi OS 3.x — no re-authentication needed after a reboot.

---

## Step 6 — Enable IP forwarding (required for subnet routing)

```bash
echo 'net.ipv4.ip_forward = 1' | tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | tee -a /etc/sysctl.d/99-tailscale.conf
sysctl -p /etc/sysctl.d/99-tailscale.conf
```

Add this to the on-boot script above the `tailscaled` start line so it applies
after every reboot.

---

## Repeat per site

Run steps 1–6 on each UDM. Use a different `--hostname` and `--advertise-routes`
matching each site's actual subnets. Approve each one in the admin console.

---

## What you get

| From | To | How |
|------|----|-----|
| WSL box | Any server/workstation at any SVH site | Tailscale → UDM subnet router |
| WSL box | Printers, cameras, network gear | Same — no Tailscale on those devices needed |
| UDM site A | UDM site B | Tailscale mesh — replaces site-to-site VPN |
| Phone (Tailscale app) | All SVH sites | Same mesh, no split tunnel config needed |

MagicDNS will resolve UDM node names. For managed devices at each site, you'll
still use IPs (or your internal DNS) — they're reachable but not Tailscale nodes.

---

## Firewall note

The UDM's own firewall policies still apply to traffic that enters via Tailscale.
If you can't reach a device after setup, check that the relevant UniFi firewall
rule allows traffic from the Tailscale interface (`tailscale0`) to the target VLAN.

A permissive rule for initial testing:

```
Interface: tailscale0 → any VLAN  Action: Accept
```

Tighten to specific source IPs (your WSL Tailscale IP) after confirming it works.
