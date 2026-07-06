import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { ApplicationAssetUtils, FluxDispatcher, React, UserStore } from "@webpack/common";

const APP_ID = "1480182808507973812";
const API_BASE = "http://127.0.0.1:8111";
const UNKNOWN = "Unknown Vehicle";
const LARGE_FALLBACK = "mp:https://warthunder.com/i/opengraph-wt.jpg";
const LOGO_KEYS = ["warthunderlogo", "warthunder", "logo", "main", "icon"];

const PROCESS_CHECK_MS = 10_000;
const FAILED_RETRY_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 1500;

const KILL_VERBS = ["destroyed", "shot down", "abgeschossen", "zerstört"];
const CRASH_HINTS = ["crashed", "abgestürzt"];

const logger = new Logger("WarThunderRPC");

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
    widgetBotToken: {
        type: OptionType.STRING,
        description: "Bot token of your application (treat like a password!)",
        default: "",
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

const Native = VencordNative.pluginHelpers.WarThunderRPC as PluginNative<typeof import("./native")>;

interface VehicleInfo {
    id: string;
    name: string;
    images: string[];
    wikiUrl: string;
    flag?: string;
    nation?: string;
    type?: string;
    br?: { ab: string; rb: string; sb: string; };
}

const LABELS = {
    en: { inMatch: "In Match", inHangar: "In Hangar", offline: "Offline", lastMatch: "Last match:", session: "Session:", using: "Using:" },
    de: { inMatch: "Im Gefecht", inHangar: "Im Hangar", offline: "Offline", lastMatch: "Letztes Match:", session: "Sitzung:", using: "Unterwegs mit:" },
} as const;

function labels() {
    return LABELS[settings.store.language as keyof typeof LABELS] ?? LABELS.en;
}

let timer: NodeJS.Timeout | null = null;
let stopped = true;

let wasRunning = false;
let wasInMatch = false;
let sessionStart = Date.now();
let matchStart = Date.now();
let lastProcessCheck = 0;
let lastActivityJson = "";
let lastEmptyTypeLog = 0;

let navalUnitId = "";
let navalDetectedName = "";

let kills = 0;
let deaths = 0;
let lastDmgId = 0;
let lastMatch: { kills: number; deaths: number; } | null = null;
let sessionKills = 0;
let sessionDeaths = 0;

const vehicleCache = new Map<string, VehicleInfo>();
const failedLookups = new Map<string, number>();
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
    return undefined;
}


function styledImageCandidates(vehicle: VehicleInfo): string[] {
    if (settings.store.imageStyle !== "contain") return vehicle.images;

    const padded = vehicle.images.map(url =>
        `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=512&h=512&fit=contain&output=png`
    );

    return [...padded, ...vehicle.images];
}

async function getVehicleImageAsset(vehicle: VehicleInfo): Promise<string | undefined> {
    for (const url of styledImageCandidates(vehicle)) {
        const asset = await getAsset(url);
        if (asset) return asset;
    }
    return undefined;
}

async function resolveVehicle(rawType: string): Promise<VehicleInfo | null> {
    const unitId = unitIdFromType(rawType);
    if (!unitId) return null;

    const cached = vehicleCache.get(unitId);
    if (cached) return cached;

    const failedAt = failedLookups.get(unitId);
    if (failedAt && Date.now() - failedAt < FAILED_RETRY_MS) return null;

    try {
        const raw = await Native.resolveVehicleInfo(unitId);
        logger.info(`Resolved "${unitId}" ->`, raw);

        if (raw?.name && raw.name !== UNKNOWN) {
            const info: VehicleInfo = { id: unitId, ...raw };
            vehicleCache.set(unitId, info);
            failedLookups.delete(unitId);
            return info;
        }
    } catch (e) {
        logger.warn(`resolveVehicleInfo failed for "${unitId}"`, e);
    }

    failedLookups.set(unitId, Date.now());
    return null;
}

function telemetryLine(state: any, indicators: any): string | null {
    const parts: string[] = [];

    if (state?.valid) {
        const speed = state["TAS, km/h"] ?? state["IAS, km/h"];
        const alt = state["H, m"];

        if (typeof speed === "number" && speed > 0) parts.push(`${Math.round(speed)} km/h`);
        if (typeof alt === "number" && alt > 0) parts.push(`${Math.round(alt).toLocaleString("de-DE")} m`);
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
async function baselineKillFeed() {
    lastDmgId = 0;
    const hud = await readJson("hudmsg?lastEvt=0&lastDmg=0");
    for (const entry of hud?.damage ?? []) {
        if (typeof entry.id === "number") lastDmgId = Math.max(lastDmgId, entry.id);
    }
}

async function updateKillFeed() {
    const me = settings.store.playerName?.trim();
    if (!me || !settings.store.showKills) return;

    const hud = await readJson(`hudmsg?lastEvt=0&lastDmg=${lastDmgId}`);
    let ownVehicleName = "";
    const ownVehicleRe = new RegExp(escapeRegExp(me) + "\\s*\\(((?:[^()]|\\([^()]*\\))+)\\)");

    for (const entry of hud?.damage ?? []) {
        if (typeof entry.id === "number") lastDmgId = Math.max(lastDmgId, entry.id);
        const msg = String(entry.msg ?? "");
        classifyDamage(msg, me);

        const own = ownVehicleRe.exec(msg);
        if (own?.[1]) ownVehicleName = own[1].trim();
    }

    if (ownVehicleName && ownVehicleName !== navalDetectedName) {
        navalDetectedName = ownVehicleName;
        try {
            const id = await Native.resolveUnitIdByName(ownVehicleName);
            if (id) {
                navalUnitId = id;
                logger.info(`Eigenes Fahrzeug aus Killfeed: "${ownVehicleName}" -> ${id}`);
            } else {
                logger.warn(`Killfeed-Name nicht in Namens-Tabelle: "${ownVehicleName}"`);
            }
        } catch {
        }
    }
}


const WIDGET_MIN_INTERVAL_MS = 15_000;
let lastWidgetPush = 0;
let lastWidgetJson = "";

function brForMode(vehicle: VehicleInfo | null): string | undefined {
    const mode = settings.store.brMode;
    if (mode === "off" || !vehicle?.br) return undefined;
    return vehicle.br[mode as "ab" | "rb" | "sb"];
}

async function pushWidget(vehicle: VehicleInfo | null, status: string, force = false) {
    if (!settings.store.widgetEnabled) return;

    const token = settings.store.widgetBotToken?.trim();
    if (!token) return;

    const me = UserStore.getCurrentUser();
    if (!me?.id) return;

    const appId = APP_ID;
    const kd = sessionDeaths > 0 ? (sessionKills / sessionDeaths).toFixed(2) : String(sessionKills);
    const matchKd = deaths > 0 ? (kills / deaths).toFixed(2) : String(kills);

    const dynamic: any[] = [
        { type: 1, name: "status", value: status },
        { type: 1, name: "vehicle", value: vehicle?.name ?? "—" },
        { type: 1, name: "nation", value: vehicle?.nation ?? "—" },
        { type: 1, name: "vehicle_type", value: vehicle?.type ?? "—" },
        { type: 1, name: "br", value: brForMode(vehicle) ?? "—" },
        { type: 2, name: "kills", value: kills },
        { type: 2, name: "deaths", value: deaths },
        { type: 2, name: "match_kills", value: kills },
        { type: 2, name: "match_deaths", value: deaths },
        { type: 2, name: "session_kills", value: sessionKills },
        { type: 2, name: "session_deaths", value: sessionDeaths },
        { type: 1, name: "kd", value: kd },
        { type: 1, name: "session_kd", value: kd },
        { type: 1, name: "match_kd", value: matchKd },
        { type: 1, name: "br_line", value: [brForMode(vehicle) && `BR ${brForMode(vehicle)}`, vehicle?.nation].filter(Boolean).join(" · ") || "—" },
        { type: 1, name: "stats_line", value: `⚔ ${sessionKills} ☠ ${sessionDeaths} · K/D ${kd}` },
    ];

    if (vehicle?.images[0]) dynamic.push({ type: 3, name: "vehicle_image", value: { url: vehicle.images[0] } });
    if (vehicle?.images[1]) dynamic.push({ type: 3, name: "vehicle_art", value: { url: vehicle.images[1] } });
    if (vehicle?.flag) dynamic.push({ type: 3, name: "flag_image", value: { url: vehicle.flag } });

    const json = JSON.stringify({ username: me.username, data: { dynamic } });

    const now = Date.now();
    if (!force && (json === lastWidgetJson || now - lastWidgetPush < WIDGET_MIN_INTERVAL_MS)) return;
    lastWidgetPush = now;
    lastWidgetJson = json;

    try {
        const res = await Native.pushWidgetProfile(appId, me.id, token, json);
        if (!res.ok) logger.warn("Widget push failed", res);
    } catch (e) {
        logger.warn("Widget push failed", e);
    }
}

async function tick() {
    const now = Date.now();

    let running = wasRunning;
    if (!wasRunning || now - lastProcessCheck >= PROCESS_CHECK_MS) {
        running = await Native.isWarThunderRunning();
        lastProcessCheck = now;
    }

    if (running && wasRunning) {
        const probe = await readJson("indicators");
        if (probe === null) {
            running = await Native.isWarThunderRunning();
            lastProcessCheck = Date.now();
        }
    }

    if (!running) {
        if (wasRunning) {
            pushActivity(null);
            await pushWidget(null, labels().offline, true);
        }
        wasRunning = false;
        wasInMatch = false;
        return;
    }

    if (!wasRunning) {
        wasRunning = true;
        sessionStart = Date.now();
        matchStart = Date.now();
        lastMatch = null;
        sessionKills = 0;
        sessionDeaths = 0;
        navalUnitId = "";
        navalDetectedName = "";
    }

    const wantTelemetry = settings.store.showTelemetry;
    const [indicators, mapInfo, state] = await Promise.all([
        readJson("indicators"),
        readJson("map_info.json"),
        wantTelemetry ? readJson("state") : Promise.resolve(null),
    ]);

    const inMatch = Boolean(mapInfo?.valid);
    const trackKills = Boolean(settings.store.showKills && settings.store.playerName?.trim());

    if (inMatch && !wasInMatch) {
        matchStart = Date.now();
        kills = 0;
        deaths = 0;
        navalUnitId = "";
        navalDetectedName = "";
        if (trackKills) await baselineKillFeed();
    } else if (!inMatch && wasInMatch && trackKills) {
        lastMatch = { kills, deaths };
        sessionKills += kills;
        sessionDeaths += deaths;
    }
    wasInMatch = inMatch;

    if (inMatch) await updateKillFeed();

    const rawType = String(indicators?.type ?? "").trim();

    if (!rawType && indicators && Date.now() - lastEmptyTypeLog > 60_000) {
        lastEmptyTypeLog = Date.now();
        logger.info("indicators ohne type-Feld:", indicators);
    }

    const vehicle = await resolveVehicle(rawType || navalUnitId);

    const L = labels();
    let stateLine = inMatch ? L.inMatch : L.inHangar;

    {
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
    }

    const logo = (await getLogoAsset()) ?? LARGE_FALLBACK;
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

    if (!smallImage && settings.store.smallImageMode !== "none" && largeImage !== logo) {
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
        buttonLabels.push("Vehicle Wiki");
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
        details = `${labels().using} ${vehicle.name}`;

        const brMode = settings.store.brMode;
        if (brMode !== "off" && vehicle.br) {
            const br = vehicle.br[brMode as "ab" | "rb" | "sb"];
            if (br) details += ` · BR ${br}`;
        }
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

    pushActivity(activity);

    await pushWidget(vehicle, inMatch ? labels().inMatch : labels().inHangar);
}

async function loop() {
    if (stopped) return;

    try {
        await tick();
    } catch (e) {
        logger.error("tick failed", e);
    }

    if (stopped) return;
    const seconds = Number(settings.store.updateInterval) || 2;
    timer = setTimeout(loop, seconds * 1000);
}

export default definePlugin({
    name: "WarThunderRPC",
    description: "War Thunder rich presence with live telemetry, kill counter, vehicle images and buttons",
    authors: [{ name: "Zockerwolf76", id: 0n }],
    settings,

    start() {
        stopped = false;
        wasRunning = false;
        wasInMatch = false;
        lastProcessCheck = 0;
        loop();
    },

    stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = null;
        wasRunning = false;
        wasInMatch = false;
        lastActivityJson = "";
        pushActivity(null);
    },
});
