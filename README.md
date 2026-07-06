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

## Notes

- RPC is only shown while War Thunder is running.
- If wiki lookup fails, the plugin falls back to `Unknown Vehicle` (or raw type if that mode is selected).

# WarThunderRPC — Patch Notes V1.1

## New: Ship Detection (Naval Battles)

Naval battles are now supported — even though the War Thunder API
(`localhost:8111/indicators`) simply returns `{valid: false}` for ships and never
reveals the player's vehicle.

- The player's ship is identified from the **kill feed** instead: as soon as your
  nickname appears there (dealing or taking a hit), the ship name is extracted from
  the parentheses.
- The localized display name (German **and** English) is resolved back into a unit ID
  via the WT datamine localization table (~5.8 MB CSV, cached on disk for 7 days) —
  after that, render, BR, flag and vehicle type work as usual.
- Naval **long names** ("Fletcher-class, USS Bennion (DD-662), 1944") with nested
  parentheses are now recognized correctly (3,872 additional name variants in the
  lookup table, regex fix for nested parentheses).
- Requirement: nickname set in the plugin settings. The ship appears from your first
  kill feed mention in the match.

## Reworked: Nation & Flag Detection

The operator nation now comes from the **authoritative source** — the wiki unit page:

- **Wiki operator parser**: The header flag and the "Operator" infobox of the unit
  page are parsed directly from the HTML. This fixes all previously wrong cases:
  Shenyang F-5 → **North Korea**, F-14A IRIAF → **Iran**, Su-30MK2V → **Venezuela**,
  JF-17 / A-5C → **Pakistan**, and so on.
- **Fallback chain** (if the wiki does not respond): manual overrides →
  ID suffixes including air force abbreviations (`_iriaf`, `_iaf`, `_idf`, `_raaf`,
  `_rocaf`, 244 export units) → country in the name's parentheses → tree nation
  from the datamine.
- **Flags from Gaijin's CDN**: Flag images now come uniformly from
  `static.encyclopedia.warthunder.com/unit_tooltip/` — for **all** nations including
  USSR, GDR, German Empire, etc. The broken Wikimedia link (USSR) is gone for good,
  and newly added nations work automatically.
- Country database extended to **65 nations** (all operator countries of the wiki).

## Profile Widget

- **Update interval lowered from 60 s to 15 s** — kills/deaths show up much faster.
- New field **`match_kd`** (K/D of the current match only) for the second stats row.
- New field **`vehicle_art`** (social artwork with background) as an alternative to
  the transparent render — intended for hero layouts.
- New **alias fields** `session_kd`, `match_kills`, `match_deaths` — field names in
  the widget editor and the plugin now match in both naming schemes.

## Settings Page Rework

- Completely restructured with **visual section headers**:
  Presence · Kill Counter · Images · Buttons · Profile Widget · Advanced
- **Removed** (unnecessary): "In Match/In Hangar" toggle (now always on),
  raw name source (`/indicators` mode), separate widget app ID (uses the RPC app).
- Descriptions shortened and cleaned up; existing settings are preserved.

