# WarThunderRPC

A Vencord userplugin that shows what you're playing in War Thunder as Discord Rich Presence: the vehicle you're in, its render image, BR, nation flag, live telemetry and a kill counter. It can also push your stats to a Discord profile widget.

---

## Features

| | |
|---|---|
| **Presence** | `Using: <vehicle> · BR x.x`, match/hangar state, elapsed time |
| **Images** | Vehicle render as the large image, nation flag as the small badge |
| **Telemetry** | Live speed and altitude during a match |
| **Kill counter** | Kills/deaths from the kill feed, last-match or session summary in the hangar |
| **Naval support** | Detects your ship from the kill feed (the game API doesn't report ships) |
| **Nation detection** | Operator nation parsed from the wiki, with 65 countries supported |
| **Buttons** | Vehicle wiki page plus an optional custom button |
| **Profile widget** | Live stats on your Discord profile (optional) |
| **Languages** | English and German |

## Requirements

- Vencord **built from source** (userplugins need a source build)
- War Thunder running. The plugin reads the game's local API at `http://127.0.0.1:8111`
- Windows or Linux

## Installation

1. Download the latest archive from [Releases](https://github.com/Zockerwolf76/WarThunder-DiscordRPC-Vencord-Plugin/releases).
2. Extract it and copy the `WarThunderRPC` folder into `Vencord/src/userplugins/`.
3. Rebuild Vencord:
   ```bash
   pnpm build
   ```
4. Fully restart Discord (quit it from the tray as well).
5. Enable **WarThunderRPC** in *Settings → Vencord → Plugins*.

**Updating:** replace the files in `src/userplugins/WarThunderRPC/`, run `pnpm build` again and restart Discord.

## Settings

| Section | Setting | What it does |
|---|---|---|
| Presence | Show telemetry | Speed and altitude in the state line |
| | Battle Rating | RB / AB / SB / off |
| | Elapsed time | Current match / whole session / off |
| | Language | English / Deutsch |
| Kill Counter | Player name | Your exact in-game nickname **without clan tag**. Required for the kill counter **and** ship detection |
| | Show kills | Kills/deaths in the state line |
| | Hangar summary | Last match / session totals / off |
| Images | Vehicle image | Vehicle render instead of the War Thunder logo |
| | Image style | *Fit* (whole vehicle visible) or *Fill* (cropped, larger) |
| | Small badge | Nation flag / War Thunder logo / none |
| Buttons | Wiki button | Link to the vehicle's wiki page |
| | Button 2 | Custom label and URL. `{id}` and `{name}` get replaced |
| Profile Widget | Enable, bot token | See below |
| Advanced | Update interval | 1–10 seconds |

## Profile widget

Pushes live stats to a profile widget of the RPC application (at most every 15 s, and immediately when your status changes).

The **bot token** is entered in the plugin settings, but it is **stored in a separate local file** in Discord's data folder, not in your Vencord settings. This keeps it out of settings exports and cloud sync. Tokens from older versions are moved there automatically.

<details>
<summary>Available widget fields</summary>

| Field | Type | Content |
|---|---|---|
| `status` | text | In Match / In Hangar / Offline |
| `vehicle` | text | Vehicle name |
| `nation` | text | Operator nation |
| `vehicle_type` | text | e.g. Medium Tank, Fighter |
| `br` | text | BR for the selected mode |
| `br_line` | text | `BR x.x · Nation` |
| `match_kills`, `match_deaths` | number | Current match (last match while in hangar) |
| `match_kd` | text | K/D of that match |
| `session_kills`, `session_deaths` | number | Whole session, including the running match |
| `session_kd` | text | Session K/D |
| `stats_line` | text | `⚔ kills ☠ deaths · K/D x.xx` |
| `kills`, `deaths`, `kd` | | Aliases of `match_kills`, `match_deaths` and `session_kd` |
| `vehicle_image` | image | Transparent vehicle render |
| `vehicle_art` | image | Wiki social artwork with background, for hero layouts |
| `flag_image` | image | Nation flag |

</details>

## How it works

- **Vehicle:** read from `/indicators` and resolved through the War Thunder wiki (name, render, operator) and the datamine (BR, type, tree nation).
- **Ships:** `/indicators` returns nothing for ships, so the plugin picks up your ship name from the kill feed as soon as you appear in it, and maps it back to a unit ID.
- **Caching:** datamine files are cached on disk for 7 days. If the wiki is unreachable, name, BR and nation still come from the datamine.

## Troubleshooting

| Problem | Fix |
|---|---|
| No presence at all | Is War Thunder running? Check that `http://127.0.0.1:8111` opens in a browser while you're in game |
| Kill counter stays at 0 | Player name must match exactly, without clan tag |
| Ship not shown | It only appears after your first kill-feed mention in a match |
| Old or wrong image | Fully restart Discord, since images are cached per session |

---

## Changelog

### V1.2: Bugfixes & robustness

**Fixes**
- A single slow API response no longer ends the match. Kill counter and match timer stay intact.
- Disabling the plugin no longer brings the presence back, and quick off/on no longer starts two update loops.
- While the game is closed, the process check runs every 10 s instead of every 2 s.
- The last ship no longer stays in the presence after returning to the hangar.
- Ship detection now works even if *Show kills* is off.
- Own-vehicle detection no longer matches other players whose names contain yours (e.g. `Wolf` vs `BigWolf`).
- Special characters in vehicle names (`&quot;`, `&amp;` …) are decoded correctly.
- The fallback logo is now a valid image.
- The vehicle render is read directly from the wiki page. Unit IDs with capital letters now get the right image too.
- All flags, including the fallback path, come from Gaijin's CDN.
- Deaths without a killer ("wrecked") are now counted.
- Enabling the kill counter mid-match no longer counts old kill-feed entries.

**Improvements**
- Wiki and datamine lookups run in the background. Presence updates never stall on downloads.
- If the wiki is unreachable, the vehicle is still shown (name from the datamine) and the wiki is retried after 5 min.
- Requests send a User-Agent, so the wiki no longer blocks them.
- **Linux support** (process detection via `pgrep`).
- Altitude format and wiki button label follow the language setting.

**Profile widget**
- **Bot token moved out of settings.json** into its own local file. Existing tokens are migrated automatically.
- Status changes (match ↔ hangar ↔ offline) are pushed immediately.
- The widget switches to *Offline* when the plugin or widget is disabled.
- Session stats include the running match. Match stats show the last match while in the hangar.

### V1.1: Ships, nations & widget

- **Naval battles:** ship detection via the kill feed, including long names with nested parentheses. The name is resolved through the datamine localization table (EN + DE).
- **Nation detection reworked:** operator parsed from the wiki page (fixes e.g. Shenyang F-5 → North Korea, F-14A IRIAF → Iran, JF-17 → Pakistan). Fallbacks: overrides → ID suffixes (`_iriaf`, `_iaf`, `_raaf` …) → name → tree nation. 65 countries.
- **Flags** from Gaijin's CDN.
- **Widget:** 15 s interval (was 60 s), new fields `match_kd`, `vehicle_art`, aliases `session_kd`, `match_kills`, `match_deaths`.
- **Settings page** restructured with section headers. Removed the match-state toggle, the raw name mode and the separate widget app ID.

### V1.0

- Initial release: vehicle name in Rich Presence, match/hangar state.
