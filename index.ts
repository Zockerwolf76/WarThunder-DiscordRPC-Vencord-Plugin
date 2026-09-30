import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { ApplicationAssetUtils, FluxDispatcher, React, UserStore } from "@webpack/common";

const APP_ID = "1480182808507973812";
const API_BASE = "http://127.0.0.1:8111";
const UNKNOWN = "Unknown Vehicle";
const LARGE_FALLBACK_URL = "https://warthunder.com/i/opengraph-wt.jpg";
const LOGO_KEYS = ["warthunderlogo", "warthunder", "logo", "main", "icon"];

const PROCESS_CHECK_MS = 10_000;
const FAILED_RETRY_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 1500;

const KILL_VERBS = ["destroyed", "shot down", "abgeschossen", "zerstört"];
const CRASH_HINTS = ["crashed", "wrecked", "abgestürzt"];

const logger = new Logger("WarThunderRPC");

const Native = VencordNative.pluginHelpers.WarThunderRPC as PluginNative<typeof import("./native")>;

const sectionHeader = (title: string) => ({
    type: OptionType.COMPONENT,
    description: "",
    component: () => React.createElement("div", {
        style: {
            marginTop: "20px",
            fontWeight: 600,
            fontSize: "16px",
            color: "var(--header-primary)",
            borderBottom: "1px solid var(--background-modifier-accent)",
            paddingBottom: "6px",
        },
    }, title),
} as any);

/** Token-Eingabe: der Token geht direkt in eine Datei im Discord-Datenordner, nie in settings.json. */
function TokenSetting() {
    const [value, setValue] = React.useState("");
    const [status, setStatus] = React.useState("…");

    const refresh = () => Native.hasWidgetToken()
        .then(has => setStatus(has ? "✅ Token gespeichert" : "Kein Token gespeichert"))
        .catch(() => setStatus("Status unbekannt"));

    React.useEffect(() => { refresh(); }, []);

    const save = async (token: string) => {
        const ok = await Native.setWidgetToken(token);
        setValue("");
        if (!ok) setStatus("❌ Speichern fehlgeschlagen");
        else refresh();
    };

    const inputStyle = {
        flex: 1,
        padding: "8px 10px",
        borderRadius: "4px",
        border: "1px solid var(--background-modifier-accent)",
        background: "var(--input-background, var(--background-secondary))",
        color: "var(--text-normal)",
    };
    const buttonStyle = {
        padding: "8px 14px",
        borderRadius: "4px",
        border: "none",
        cursor: "pointer",
        background: "var(--brand-500, #5865f2)",
        color: "white",
    };

    return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
        React.createElement("div", { style: { color: "var(--header-secondary)", fontSize: "14px" } },
            "Bot token of your application — stored in a separate local file, not in your Vencord settings/backups"),
        React.createElement("div", { style: { display: "flex", gap: "8px" } },
            React.createElement("input", {
                type: "password",
                placeholder: "Paste token…",
                value,
                autoComplete: "off",
                onChange: (e: any) => setValue(e.currentTarget.value),
                style: inputStyle,
            }),
            React.createElement("button", { style: buttonStyle, onClick: () => value.trim() && save(value) }, "Save"),
            React.createElement("button", { style: { ...buttonStyle, background: "var(--button-danger-background, #da373c)" }, onClick: () => save("") }, "Clear"),
        ),
        React.createElement("div", { style: { color: "var(--text-muted)", fontSize: "12px" } }, status),
    );
}

const settings = definePluginSettings({
    secPresence: sectionHeader("🎮 Presence"),
    showTelemetry: {
        type: OptionType.BOOLEAN,
        description: "Show speed & altitude in a match",
        default: true,
    },
    brMode: {
        type: OptionType.SELECT,
        description: "Battle Rating shown next to the vehicle",
        options: [
            { label: "Realistic (RB)", value: "rb", default: true },
            { label: "Arcade (AB)", value: "ab" },
            { label: "Simulator (SB)", value: "sb" },
            { label: "Off", value: "off" },
        ],
    },
    timestampMode: {
        type: OptionType.SELECT,
        description: "Elapsed time",
        options: [
            { label: "Time in current match", value: "match", default: true },
            { label: "Total session time", value: "session" },
            { label: "Off", value: "off" },
        ],
    },
    language: {
        type: OptionType.SELECT,
        description: "Language",
        options: [
            { label: "English", value: "en", default: true },
            { label: "Deutsch", value: "de" },
        ],
    },

    secKills: sectionHeader("⚔️ Kill Counter"),
    playerName: {
        type: OptionType.STRING,
        description: "Your exact in-game nickname without clan tag (empty = disabled; also needed for ship detection)",
        default: "",
    },
    showKills: {
        type: OptionType.BOOLEAN,
        description: "Show kills/deaths in the state line",
        default: true,
    },
    showLastMatch: {
        type: OptionType.SELECT,
        description: "Summary shown while in hangar",
        options: [
            { label: "Last match's kills/deaths", value: "last", default: true },
            { label: "Session totals", value: "session" },
            { label: "Off", value: "off" },
        ],
    },

    secImages: sectionHeader("🖼️ Images"),
    showVehicleImage: {
        type: OptionType.BOOLEAN,
        description: "Use the vehicle's render as the large image",
        default: true,
    },
    imageStyle: {
        type: OptionType.SELECT,
        description: "Large image style",
        options: [
            { label: "Fit — whole vehicle visible (smaller)", value: "contain", default: true },
            { label: "Fill — cropped by Discord (larger)", value: "cover" },
        ],
    },
    smallImageMode: {
        type: OptionType.SELECT,
        description: "Small badge (bottom-right)",
        options: [
            { label: "Nation flag", value: "flag", default: true },
            { label: "War Thunder logo", value: "logo" },
            { label: "None", value: "none" },
        ],
    },

    secButtons: sectionHeader("🔗 Buttons"),
    showWikiButton: {
        type: OptionType.BOOLEAN,
        description: "Button 1: vehicle wiki page",
        default: true,
    },
    buttonTwoLabel: {
        type: OptionType.STRING,
        description: "Button 2 label (empty = disabled)",
        default: "",
    },
    buttonTwoUrl: {
        type: OptionType.STRING,
        description: "Button 2 URL template — {id} and {name} get replaced",
        default: "",
    },

    secWidget: sectionHeader("📊 Profile Widget"),
    widgetEnabled: {
        type: OptionType.BOOLEAN,
        description: "Push live stats to your profile widget",
        default: false,
    },
    widgetToken: {
        type: OptionType.COMPONENT,
        description: "",
        component: TokenSetting,
    } as any,
    // Alt: Token lag früher hier im Klartext. Wird beim Start in die Token-Datei migriert und geleert.
    widgetBotToken: {
        type: OptionType.STRING,
        description: "Legacy — migrated automatically, leave empty",
        default: "",
        hidden: true,
    },

    secAdvanced: sectionHeader("⚙️ Advanced"),
    updateInterval: {
        type: OptionType.SLIDER,
        description: "Update interval (seconds)",
        markers: [1, 2, 3, 5, 10],
        default: 2,
        stickToMarkers: true,
    },
});

interface VehicleInfo {
    id: string;
    name: string;
    images: string[];
    wikiUrl: string;
    flag?: string;
    nation?: string;
    type?: string;
    br?: { ab: string; rb: string; sb: string; };
    socialImage?: string;
    partial?: boolean;
}

const LABELS = {
    en: { inMatch: "In Match", inHangar: "In Hangar", offline: "Offline", lastMatch: "Last match:", session: "Session:", using: "Using:", wiki: "Vehicle Wiki", locale: "en-US" },
    de: { inMatch: "Im Gefecht", inHangar: "Im Hangar", offline: "Offline", lastMatch: "Letztes Match:", session: "Sitzung:", using: "Unterwegs mit:", wiki: "Fahrzeug-Wiki", locale: "de-DE" },
} as const;

function labels() {
    return LABELS[settings.store.language as keyof typeof LABELS] ?? LABELS.en;
}

function playerName() {
    return settings.store.playerName?.trim() ?? "";
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** Wird bei jedem start()/stop() erhöht — ein Tick aus einem alten Lauf darf danach nichts mehr senden. */
let runId = 0;

let wasRunning = false;
let wasInMatch = false;
let sessionStart = Date.now();
let matchStart = Date.now();
let lastProcessCheck = 0;
let lastActivityJson = "";
let lastEmptyTypeLog = 0;

/** Erhöht sich bei jedem Match-Start, damit verspätete Namens-Lookups kein altes Schiff eintragen. */
let matchId = 0;
let navalUnitId = "";
let navalDetectedName = "";

let kills = 0;
let deaths = 0;
let lastDmgId = 0;
/** Für welchen Spielernamen die Killfeed-Baseline gesetzt wurde ("" = noch keine). */
let killFeedBaselineFor = "";
let lastMatch: { kills: number; deaths: number; } | null = null;
let sessionKills = 0;
let sessionDeaths = 0;

const vehicleCache = new Map<string, { info: VehicleInfo | null; at: number; }>();
const pendingLookups = new Set<string>();
const assetCache = new Map<string, string>();
const failedAssets = new Map<string, number>();

function pushActivity(activity: any) {
    const json = JSON.stringify(activity);
    if (json === lastActivityJson) return;
    lastActivityJson = json;

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        socketId: "WarThunderRPC",
    });
}

async function readJson(path: string) {
    try {
        const res = await fetch(`${API_BASE}/${path}`, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function unitIdFromType(rawType: string) {
    if (!rawType) return "";
    const tail = rawType.split("/").pop() ?? rawType;
    return tail.split("?")[0].split("#")[0].replace(/^['"]+|['"]+$/g, "").trim();
}

async function getAsset(key: string): Promise<string | undefined> {
    const cached = assetCache.get(key);
    if (cached) return cached;

    const failedAt = failedAssets.get(key);
    if (failedAt && Date.now() - failedAt < FAILED_RETRY_MS) return undefined;

    try {
        const [id] = await ApplicationAssetUtils.fetchAssetIds(APP_ID, [key]);
        if (id) {
            assetCache.set(key, id);
            failedAssets.delete(key);
            return id;
        }
        logger.warn(`fetchAssetIds returned nothing for "${key}"`);
    } catch (e) {
        logger.warn(`fetchAssetIds failed for "${key}"`, e);
    }

    failedAssets.set(key, Date.now());
    return undefined;
}

async function getLogoAsset() {
    for (const key of LOGO_KEYS) {
        const id = await getAsset(key);
        if (id) return id;
    }
    // Fallback über Discords Media-Proxy statt eines ungültigen "mp:https://…"
    return getAsset(LARGE_FALLBACK_URL);
}

function styledImageCandidates(vehicle: VehicleInfo): string[] {
    if (settings.store.imageStyle !== "contain") return vehicle.images;

    return vehicle.images.flatMap(url => [
        `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=512&h=512&fit=contain&output=png`,
        url,
    ]);
}

async function getVehicleImageAsset(vehicle: VehicleInfo): Promise<string | undefined> {
    for (const url of styledImageCandidates(vehicle)) {
        const asset = await getAsset(url);
        if (asset) return asset;
    }
    return undefined;
}

/**
 * Nicht-blockierend: gibt sofort zurück, was im Cache liegt, und startet den Lookup im Hintergrund.
 * So hängt der Tick nie auf Wiki-/Datamine-Downloads.
 */
function resolveVehicle(unitId: string): VehicleInfo | null {
    if (!unitId) return null;

    const entry = vehicleCache.get(unitId);
    const needsLookup = !entry
        || ((entry.info === null || entry.info.partial) && Date.now() - entry.at >= FAILED_RETRY_MS);

    if (needsLookup && !pendingLookups.has(unitId)) {
        pendingLookups.add(unitId);

        Native.resolveVehicleInfo(unitId)
            .then(raw => {
                logger.info(`Resolved "${unitId}" ->`, raw);
                const info: VehicleInfo | null = raw?.name && raw.name !== UNKNOWN ? { id: unitId, ...raw } : null;
                // Ein brauchbares Teilergebnis nicht durch einen Fehlschlag ersetzen
                vehicleCache.set(unitId, { info: info ?? entry?.info ?? null, at: Date.now() });
            })
            .catch(e => {
                logger.warn(`resolveVehicleInfo failed for "${unitId}"`, e);
                vehicleCache.set(unitId, { info: entry?.info ?? null, at: Date.now() });
            })
            .finally(() => pendingLookups.delete(unitId));
    }

    return entry?.info ?? null;
}

function telemetryLine(state: any, indicators: any): string | null {
    const parts: string[] = [];
    const { locale } = labels();

    if (state?.valid) {
        const speed = state["TAS, km/h"] ?? state["IAS, km/h"];
        const alt = state["H, m"];

        if (typeof speed === "number" && speed > 0) parts.push(`${Math.round(speed)} km/h`);
        if (typeof alt === "number" && alt > 0) parts.push(`${Math.round(alt).toLocaleString(locale)} m`);
    } else if (typeof indicators?.speed === "number" && indicators.speed > 0) {
        parts.push(`${Math.round(indicators.speed)} km/h`);
    }

    return parts.length ? parts.join(" · ") : null;
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPlayerIndex(msg: string, me: string): number {
    const re = new RegExp(`(?:^|[^\\w-])${escapeRegExp(me)}(?![\\w-])`);
    const match = re.exec(msg);
    if (!match) return -1;
    return match.index + (match[0].length - me.length);
}

function classifyDamage(rawMsg: string, me: string) {
    const msg = rawMsg.trim();
    const meIdx = findPlayerIndex(msg, me);
    if (meIdx === -1) return;

    const lower = msg.toLowerCase();
    const firstParen = msg.indexOf("(");
    const iAmFirst = firstParen === -1 ? meIdx === 0 : meIdx < firstParen;

    if (CRASH_HINTS.some(h => lower.includes(h))) {
        if (iAmFirst) deaths++;
        return;
    }

    if (KILL_VERBS.some(v => lower.includes(v))) {
        if (iAmFirst) kills++;
        else deaths++;
    }
}

async function baselineKillFeed(): Promise<boolean> {
    const hud = await readJson("hudmsg?lastEvt=0&lastDmg=0");
    if (!hud) return false;

    lastDmgId = 0;
    for (const entry of hud.damage ?? []) {
        if (typeof entry.id === "number") lastDmgId = Math.max(lastDmgId, entry.id);
    }
    return true;
}

async function updateKillFeed() {
    const me = playerName();
    if (!me) return;

    // Baseline beim Match-Start, oder wenn Name/Tracking mitten im Match eingeschaltet wurde:
    // alte Killfeed-Einträge nicht nachträglich zählen.
    if (killFeedBaselineFor !== me) {
        if (await baselineKillFeed()) killFeedBaselineFor = me;
        return;
    }

    const hud = await readJson(`hudmsg?lastEvt=0&lastDmg=${lastDmgId}`);
    if (!hud) return;

    const countKills = settings.store.showKills;
    const ownVehicleRe = new RegExp(`(?:^|[^\\w-])${escapeRegExp(me)}\\s*\\(((?:[^()]|\\([^()]*\\))+)\\)`);
    let ownVehicleName = "";

    for (const entry of hud.damage ?? []) {
        if (typeof entry.id === "number") lastDmgId = Math.max(lastDmgId, entry.id);
        const msg = String(entry.msg ?? "");

        if (countKills) classifyDamage(msg, me);

        const own = ownVehicleRe.exec(msg);
        if (own?.[1]) ownVehicleName = own[1].trim();
    }

    if (ownVehicleName && ownVehicleName !== navalDetectedName) {
        navalDetectedName = ownVehicleName;
        const forMatch = matchId;

        Native.resolveUnitIdByName(ownVehicleName)
            .then(id => {
                if (forMatch !== matchId) return;
                if (id) {
                    navalUnitId = id;
                    logger.info(`Eigenes Fahrzeug aus Killfeed: "${ownVehicleName}" -> ${id}`);
                } else {
                    logger.warn(`Killfeed-Name nicht in Namens-Tabelle: "${ownVehicleName}"`);
                }
            })
            .catch(() => { });
    }
}

function startMatch() {
    matchId++;
    matchStart = Date.now();
    kills = 0;
    deaths = 0;
    killFeedBaselineFor = "";
    navalUnitId = "";
    navalDetectedName = "";
}

function finishMatch() {
    lastMatch = { kills, deaths };
    sessionKills += kills;
    sessionDeaths += deaths;
    kills = 0;
    deaths = 0;
    navalUnitId = "";
    navalDetectedName = "";
}


const WIDGET_MIN_INTERVAL_MS = 15_000;
let lastWidgetPush = 0;
let lastWidgetJson = "";
let lastWidgetStatus = "";
/** true, solange auf dem Profil ein anderer Status als "Offline" steht */
let widgetOnline = false;

function brForMode(vehicle: VehicleInfo | null): string | undefined {
    const mode = settings.store.brMode;
    if (mode === "off" || !vehicle?.br) return undefined;
    return vehicle.br[mode as "ab" | "rb" | "sb"];
}

function kdString(k: number, d: number) {
    return d > 0 ? (k / d).toFixed(2) : String(k);
}

async function pushWidget(vehicle: VehicleInfo | null, status: string, inMatch: boolean, opts: { force?: boolean; offline?: boolean; } = {}) {
    // Offline-Push läuft auch, wenn der Widget gerade deaktiviert wurde — sonst bleibt der alte Status stehen
    if (opts.offline) {
        if (!widgetOnline) return;
    } else if (!settings.store.widgetEnabled) {
        return;
    }

    const me = UserStore.getCurrentUser();
    if (!me?.id) return;

    const match = inMatch ? { kills, deaths } : (lastMatch ?? { kills: 0, deaths: 0 });
    const liveSessionKills = sessionKills + (inMatch ? kills : 0);
    const liveSessionDeaths = sessionDeaths + (inMatch ? deaths : 0);
    const sessionKd = kdString(liveSessionKills, liveSessionDeaths);
    const matchKd = kdString(match.kills, match.deaths);
    const br = brForMode(vehicle);

    // "kills"/"deaths"/"kd" bleiben als Aliase erhalten, damit bestehende Widget-Layouts weiter funktionieren
    const dynamic: any[] = [
        { type: 1, name: "status", value: status },
        { type: 1, name: "vehicle", value: vehicle?.name ?? "—" },
        { type: 1, name: "nation", value: vehicle?.nation ?? "—" },
        { type: 1, name: "vehicle_type", value: vehicle?.type ?? "—" },
        { type: 1, name: "br", value: br ?? "—" },
        { type: 2, name: "kills", value: match.kills },
        { type: 2, name: "deaths", value: match.deaths },
        { type: 2, name: "match_kills", value: match.kills },
        { type: 2, name: "match_deaths", value: match.deaths },
        { type: 2, name: "session_kills", value: liveSessionKills },
        { type: 2, name: "session_deaths", value: liveSessionDeaths },
        { type: 1, name: "kd", value: sessionKd },
        { type: 1, name: "session_kd", value: sessionKd },
        { type: 1, name: "match_kd", value: matchKd },
        { type: 1, name: "br_line", value: [br && `BR ${br}`, vehicle?.nation].filter(Boolean).join(" · ") || "—" },
        { type: 1, name: "stats_line", value: `⚔ ${liveSessionKills} ☠ ${liveSessionDeaths} · K/D ${sessionKd}` },
    ];

    if (vehicle?.images[0]) dynamic.push({ type: 3, name: "vehicle_image", value: { url: vehicle.images[0] } });
    const art = vehicle?.socialImage ?? vehicle?.images[1];
    if (art) dynamic.push({ type: 3, name: "vehicle_art", value: { url: art } });
    if (vehicle?.flag) dynamic.push({ type: 3, name: "flag_image", value: { url: vehicle.flag } });

    const json = JSON.stringify({ username: me.username, data: { dynamic } });

    const now = Date.now();
    // Statuswechsel (Match <-> Hangar <-> Offline) sofort pushen, sonst max. alle 15 s
    const force = opts.force || opts.offline || status !== lastWidgetStatus;
    if (json === lastWidgetJson) return;
    if (!force && now - lastWidgetPush < WIDGET_MIN_INTERVAL_MS) return;

    lastWidgetPush = now;
    lastWidgetJson = json;
    lastWidgetStatus = status;

    try {
        const res = await Native.pushWidgetProfile(APP_ID, me.id, json);
        if (!res.ok) {
            if (res.error !== "no token") logger.warn("Widget push failed", res);
            lastWidgetJson = ""; // beim nächsten Tick erneut versuchen
            return;
        }
        widgetOnline = !opts.offline;
    } catch (e) {
        logger.warn("Widget push failed", e);
        lastWidgetJson = "";
    }
}

function goOffline() {
    if (wasInMatch) finishMatch();
    if (wasRunning) {
        pushActivity(null);
        void pushWidget(null, labels().offline, false, { offline: true });
    }
    wasRunning = false;
    wasInMatch = false;
}

async function tick(gen: number) {
    const alive = () => gen === runId;
    let processCheckedNow = false;

    // Prozess-Check höchstens alle PROCESS_CHECK_MS — auch wenn das Spiel NICHT läuft
    let running = wasRunning;
    if (Date.now() - lastProcessCheck >= PROCESS_CHECK_MS) {
        running = await Native.isWarThunderRunning();
        lastProcessCheck = Date.now();
        processCheckedNow = true;
    }
    if (!alive()) return;

    if (!running) {
        goOffline();
        return;
    }

    const wantTelemetry = settings.store.showTelemetry;
    const [indicators, mapInfo, state] = await Promise.all([
        readJson("indicators"),
        readJson("map_info.json"),
        wantTelemetry ? readJson("state") : Promise.resolve(null),
    ]);
    if (!alive()) return;

    // API antwortet gar nicht mehr -> prüfen, ob das Spiel inzwischen zu ist
    if (indicators === null && mapInfo === null && wasRunning && !processCheckedNow) {
        running = await Native.isWarThunderRunning();
        lastProcessCheck = Date.now();
        if (!alive()) return;
        if (!running) {
            goOffline();
            return;
        }
    }

    if (!wasRunning) {
        wasRunning = true;
        wasInMatch = false;
        sessionStart = Date.now();
        matchStart = Date.now();
        lastMatch = null;
        sessionKills = 0;
        sessionDeaths = 0;
        kills = 0;
        deaths = 0;
        navalUnitId = "";
        navalDetectedName = "";
    }

    // null = Request fehlgeschlagen -> alten Zustand behalten, statt das Match zu beenden
    const inMatch = mapInfo === null ? wasInMatch : Boolean(mapInfo.valid);
    const trackKills = Boolean(settings.store.showKills && playerName());

    if (inMatch && !wasInMatch) startMatch();
    else if (!inMatch && wasInMatch) finishMatch();
    wasInMatch = inMatch;

    if (inMatch) await updateKillFeed();
    if (!alive()) return;

    const rawType = String(indicators?.type ?? "").trim();

    if (inMatch && !rawType && indicators && Date.now() - lastEmptyTypeLog > 60_000) {
        lastEmptyTypeLog = Date.now();
        logger.info("indicators ohne type-Feld:", indicators);
    }

    // Killfeed-Schiff nur im Match verwenden, sonst hängt das letzte Schiff im Hangar
    const vehicle = resolveVehicle(unitIdFromType(rawType) || (inMatch ? navalUnitId : ""));

    const L = labels();
    let stateLine = inMatch ? L.inMatch : L.inHangar;

    if (inMatch) {
        if (trackKills) {
            stateLine += ` · ⚔ ${kills}`;
            if (deaths > 0) stateLine += ` ☠ ${deaths}`;
        }

        if (wantTelemetry) {
            const tele = telemetryLine(state, indicators);
            if (tele) stateLine += ` · ${tele}`;
        }
    } else if (trackKills) {
        const mode = settings.store.showLastMatch;
        if (mode === "last" && lastMatch) {
            stateLine += ` · ${L.lastMatch} ⚔ ${lastMatch.kills} ☠ ${lastMatch.deaths}`;
        } else if (mode === "session" && (sessionKills > 0 || sessionDeaths > 0)) {
            stateLine += ` · ${L.session} ⚔ ${sessionKills} ☠ ${sessionDeaths}`;
        }
    }

    const logo = await getLogoAsset();
    let largeImage = logo;
    let largeText = "War Thunder";

    if (settings.store.showVehicleImage && vehicle) {
        const vehicleAsset = await getVehicleImageAsset(vehicle);
        if (vehicleAsset) {
            largeImage = vehicleAsset;
            largeText = [vehicle.name, vehicle.type, vehicle.nation].filter(Boolean).join(" · ");
        }
    }

    let smallImage: string | undefined;
    let smallText: string | undefined;

    if (settings.store.smallImageMode === "flag" && vehicle?.flag) {
        const flagCandidates = [
            `https://wsrv.nl/?url=${encodeURIComponent(vehicle.flag)}&w=240&h=240&fit=cover&output=png`,
            vehicle.flag,
        ];

        for (const url of flagCandidates) {
            smallImage = await getAsset(url);
            if (smallImage) break;
        }

        if (smallImage) smallText = vehicle.nation ?? vehicle.name;
    }

    if (!smallImage && settings.store.smallImageMode !== "none" && logo && largeImage !== logo) {
        smallImage = logo;
        smallText = "War Thunder";
    }

    let timestamps: { start: number; } | undefined;
    switch (settings.store.timestampMode) {
        case "match":
            timestamps = inMatch ? { start: matchStart } : undefined;
            break;
        case "session":
            timestamps = { start: sessionStart };
            break;
        default:
            timestamps = undefined;
    }

    const buttonLabels: string[] = [];
    const buttonUrls: string[] = [];

    if (settings.store.showWikiButton && vehicle?.wikiUrl) {
        buttonLabels.push(L.wiki);
        buttonUrls.push(vehicle.wikiUrl);
    }

    const b2Label = settings.store.buttonTwoLabel?.trim();
    const b2Template = settings.store.buttonTwoUrl?.trim();
    if (b2Label && b2Template && vehicle && buttonLabels.length < 2) {
        const url = b2Template
            .replaceAll("{id}", encodeURIComponent(vehicle.id))
            .replaceAll("{name}", encodeURIComponent(vehicle.name));

        if (/^https?:\/\//i.test(url)) {
            buttonLabels.push(b2Label.slice(0, 32));
            buttonUrls.push(url);
        }
    }

    let details: string | undefined;
    if (vehicle) {
        details = `${L.using} ${vehicle.name}`;
        const br = brForMode(vehicle);
        if (br) details += ` · BR ${br}`;
    }

    const activity: any = {
        application_id: APP_ID,
        name: "War Thunder",
        details,
        details_url: vehicle?.wikiUrl || undefined,
        state: stateLine,
        timestamps,
        assets: {
            large_image: largeImage,
            large_text: largeText,
            small_image: smallImage,
            small_text: smallText,
        },
        type: 0,
        flags: 1,
    };

    if (buttonLabels.length) {
        activity.buttons = buttonLabels;
        activity.metadata = { button_urls: buttonUrls };
    }

    // Plugin wurde während der awaits gestoppt -> nichts mehr senden
    if (!alive()) return;
    pushActivity(activity);

    if (settings.store.widgetEnabled) {
        await pushWidget(vehicle, inMatch ? L.inMatch : L.inHangar, inMatch);
    } else if (widgetOnline) {
        await pushWidget(null, L.offline, false, { offline: true });
    }
}

async function loop(gen: number) {
    if (gen !== runId) return;

    try {
        await tick(gen);
    } catch (e) {
        logger.error("tick failed", e);
    }

    if (gen !== runId) return;
    const seconds = Number(settings.store.updateInterval) || 2;
    timer = setTimeout(() => loop(gen), seconds * 1000);
}

async function migrateLegacyToken() {
    const legacy = settings.store.widgetBotToken?.trim();
    if (!legacy) return;

    try {
        if (await Native.setWidgetToken(legacy)) {
            settings.store.widgetBotToken = "";
            logger.info("Widget-Token aus den Einstellungen in die Token-Datei verschoben");
        }
    } catch (e) {
        logger.warn("Token-Migration fehlgeschlagen", e);
    }
}

export default definePlugin({
    name: "WarThunderRPC",
    description: "War Thunder rich presence with live telemetry, kill counter, vehicle images and buttons",
    authors: [{ name: "Zockerwolf76", id: 0n }],
    settings,

    start() {
        const gen = ++runId;
        if (timer) clearTimeout(timer);
        timer = null;
        wasRunning = false;
        wasInMatch = false;
        lastProcessCheck = 0;
        lastActivityJson = "";
        migrateLegacyToken().finally(() => loop(gen));
    },

    stop() {
        runId++;
        if (timer) clearTimeout(timer);
        timer = null;

        void pushWidget(null, labels().offline, false, { offline: true });

        wasRunning = false;
        wasInMatch = false;
        lastActivityJson = "";
        pushActivity(null);
    },
});
