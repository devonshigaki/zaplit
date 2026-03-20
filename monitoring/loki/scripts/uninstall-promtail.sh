#!/bin/bash
# uninstall-promtail.sh - Remove Promtail from the system

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
CONFIG_DIR="${CONFIG_DIR:-/etc/promtail}"
DATA_DIR="${DATA_DIR:-/var/lib/promtail}"

echo "Uninstalling Promtail..."

# Stop and disable service
if systemctl is-active --quiet promtail 2>/dev/null; then
    echo "Stopping promtail service..."
    systemctl stop promtail
fi

if systemctl is-enabled --quiet promtail 2>/dev/null; then
    echo "Disabling promtail service..."
    systemctl disable promtail
fi

# Remove systemd service
if [[ -f /etc/systemd/system/promtail.service ]]; then
    echo "Removing systemd service..."
    rm -f /etc/systemd/system/promtail.service
    systemctl daemon-reload
fi

# Remove binary
if [[ -f "${INSTALL_DIR}/promtail" ]]; then
    echo "Removing promtail binary..."
    rm -f "${INSTALL_DIR}/promtail"
fi

# Ask about config and data
read -p "Remove configuration directory (${CONFIG_DIR})? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing configuration..."
    rm -rf "$CONFIG_DIR"
fi

read -p "Remove data directory (${DATA_DIR})? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Removing data..."
    rm -rf "$DATA_DIR"
fi

echo "Promtail uninstalled successfully"
