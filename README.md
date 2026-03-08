# WarThunderRPC

Simple Vencord userplugin that shows your current War Thunder vehicle in Discord Rich Presence.

## Features

- Shows `Using: <vehicle name>` in RPC
- Uses War Thunder local API (`127.0.0.1:8111`)
- Detects match state (`In Match` / `In Hangar`)
- Optional name mode:
  - Wiki name (default)
  - Raw `/indicators.type`

## Requirements

- Vencord desktop build with userplugins enabled
- War Thunder running with local telemetry available on `http://127.0.0.1:8111`

## Installation

1. Download the latest release archive from the repo [Releases](https://github.com/Zockerwolf76/WarThunder-DiscordRPC-Vencord-Plugin/releases) tab.
2. Extract it.
3. Copy the `WarThunderRPC` folder to:
   `src/userplugins`
4. Rebuild Vencord.
5. Enable the plugin in Vencord settings.

## Plugin Settings

- `Show In Match / In Hangar`
- `Vehicle name source`
  - `Wiki name`
  - `Raw /indicators type`

## Notes

- RPC is only shown while War Thunder is running.
- If wiki lookup fails, the plugin falls back to `Unknown Vehicle` (or raw type if that mode is selected).
