#!/usr/bin/env bash
#
# ANZIKA — Linux uninstaller.
#
# Removes the .deb package (if installed that way) and optionally wipes the
# user's data. AppImage installs are single files: just delete the AppImage.
#
# Usage:
#   ./scripts/uninstall.sh               # uninstall the app, keep user data
#   ./scripts/uninstall.sh --purge-data  # also delete encrypted plan/vault/auth data
#
set -euo pipefail

APP_ID="weekly-planner"
APP_NAME="ANZIKA"

# Data lives under $XDG_CONFIG_HOME (set explicitly by the app):
DATA_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
CONFIG_DIRNAME="weekly-planner"

PURGE_DATA=false
for arg in "$@"; do
  case "$arg" in
    --purge-data) PURGE_DATA=true ;;
    *) echo "Unknown option: $arg" >&2; echo "Usage: $0 [--purge-data]" >&2; exit 1 ;;
  esac
done

have() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if have sudo; then SUDO=sudo
  else
    echo "This script needs root for package removal — 'sudo' not found." >&2
    echo "Run as root or install sudo." >&2
    exit 1
  fi
fi

removed_pkg=false

# --- deb (.dpkg) install ------------------------------------------------------
if have dpkg && dpkg -s "$APP_ID" >/dev/null 2>&1; then
  echo "Removing $APP_NAME (dpkg package '$APP_ID')…"
  if have apt-get; then
    $SUDO apt-get remove -y "$APP_ID"
  else
    $SUDO dpkg --remove "$APP_ID"
  fi
  removed_pkg=true
fi

if have rpm && rpm -q "$APP_ID" >/dev/null 2>&1; then
  echo "Removing $APP_NAME (rpm package '$APP_ID')…"
  $SUDO rpm -e "$APP_ID"
  removed_pkg=true
fi

[ "$removed_pkg" = true ] || echo "No system package found — nothing to remove (or running from an AppImage)."

# --- leftovers ----------------------------------------------------------------
if have dpkg; then
  DEB_LEFT=$($SUDO dpkg -L "$APP_ID" 2>/dev/null || true) || true
fi

# Remove desktop/menu leftovers the package may have left behind.
for f in \
  "/usr/share/applications/${APP_ID}.desktop" \
  "/usr/local/share/applications/${APP_ID}.desktop" \
  "$HOME/.local/share/applications/${APP_ID}.desktop"; do
  rm -f "$f" 2>/dev/null || true
done

echo "$APP_NAME removed."

# --- optional data purge ------------------------------------------------------
if [ "$PURGE_DATA" = true ]; then
  if [ -d "$DATA_HOME/$CONFIG_DIRNAME" ]; then
    echo "Wiping user data (plan, vault, auth) under '$DATA_HOME/$CONFIG_DIRNAME'…"
    rm -rf "$DATA_HOME/$CONFIG_DIRNAME"
    echo "User data removed."
  else
    echo "No user data directory found at '$DATA_HOME/$CONFIG_DIRNAME'."
  fi
else
  echo "User data kept at '$DATA_HOME/$CONFIG_DIRNAME' (encrypted plan, vault, auth)."
  echo "Run with --purge-data to remove it as well."
fi
