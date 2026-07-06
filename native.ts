import { execFile } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import { readFile, writeFile } from "fs/promises";
import { request } from "https";
import { tmpdir } from "os";
import { join } from "path";

const WIKI_BASE = "https://wiki.warthunder.com/unit/";
const ENCYCLOPEDIA_IMG = "https://static.encyclopedia.warthunder.com/images/";
const DATAMINE_BASE = "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/char.vromfs.bin_u/config/";
const UNITTAGS_URL = `${DATAMINE_BASE}unittags.blkx`;
const WPCOST_URL = `${DATAMINE_BASE}wpcost.blkx`;

const UNKNOWN = "Unknown Vehicle";
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const DATAMINE_RETRY_MS = 10 * 60_000;

const BR_CACHE_FILE = join(tmpdir(), "vencord-warthunderrpc-br-cache.json");
const BR_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

const COUNTRY_INFO: Record<string, { name: string; flag: string; }> = {
    country_usa: { name: "USA", flag: "https://flagcdn.com/w320/us.png" },
    country_ussr: { name: "USSR", flag: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_the_Soviet_Union.svg?width=320" },
    country_britain: { name: "Great Britain", flag: "https://flagcdn.com/w320/gb.png" },
    country_japan: { name: "Japan", flag: "https://flagcdn.com/w320/jp.png" },
    country_germany: { name: "Germany", flag: "https://flagcdn.com/w320/de.png" },
    country_france: { name: "France", flag: "https://flagcdn.com/w320/fr.png" },
    country_italy: { name: "Italy", flag: "https://flagcdn.com/w320/it.png" },
    country_sweden: { name: "Sweden", flag: "https://flagcdn.com/w320/se.png" },
    country_israel: { name: "Israel", flag: "https://flagcdn.com/w320/il.png" },
    country_china: { name: "China", flag: "https://flagcdn.com/w320/cn.png" },
    country_australia: { name: "Australia", flag: "https://flagcdn.com/w320/au.png" },
    country_belgium: { name: "Belgium", flag: "https://flagcdn.com/w320/be.png" },
    country_finland: { name: "Finland", flag: "https://flagcdn.com/w320/fi.png" },
    country_hungary: { name: "Hungary", flag: "https://flagcdn.com/w320/hu.png" },
    country_indonesia: { name: "Indonesia", flag: "https://flagcdn.com/w320/id.png" },
    country_malaysia: { name: "Malaysia", flag: "https://flagcdn.com/w320/my.png" },
    country_netherlands: { name: "The Netherlands", flag: "https://flagcdn.com/w320/nl.png" },
    country_south_africa: { name: "South Africa", flag: "https://flagcdn.com/w320/za.png" },
    country_switzerland: { name: "Switzerland", flag: "https://flagcdn.com/w320/ch.png" },
    country_thailand: { name: "Thailand", flag: "https://flagcdn.com/w320/th.png" },
    country_italy_kingdom: { name: "Kingdom of Italy", flag: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_Italy_(1861%E2%80%931946).svg?width=320" },
    country_germany_modern: { name: "FRG", flag: "https://flagcdn.com/w320/de.png" },
    country_republic_china: { name: "Republic of China", flag: "https://flagcdn.com/w320/tw.png" },
    country_russia: { name: "Russia", flag: "https://flagcdn.com/w320/ru.png" },
    country_gdr: { name: "GDR", flag: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_East_Germany.svg?width=320" },
    country_canada: { name: "Canada", flag: "https://flagcdn.com/w320/ca.png" },
    country_germany_empire: { name: "German Empire", flag: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_the_German_Empire.svg?width=320" },
    country_norway: { name: "Norway", flag: "https://flagcdn.com/w320/no.png" },
    country_romania: { name: "Romania", flag: "https://flagcdn.com/w320/ro.png" },
    country_india: { name: "India", flag: "https://flagcdn.com/w320/in.png" },
    country_pakistan: { name: "Pakistan", flag: "https://flagcdn.com/w320/pk.png" },
    country_argentina: { name: "Argentina", flag: "https://flagcdn.com/w320/ar.png" },
    country_russia_empire: { name: "Russian Empire", flag: "https://flagcdn.com/w320/ru.png" },
    country_czech: { name: "Czechia", flag: "https://flagcdn.com/w320/cz.png" },
    country_denmark: { name: "Denmark", flag: "https://flagcdn.com/w320/dk.png" },
    country_poland: { name: "Poland", flag: "https://flagcdn.com/w320/pl.png" },
    country_turkey: { name: "Türkiye", flag: "https://flagcdn.com/w320/tr.png" },
    country_austria: { name: "Austria", flag: "https://flagcdn.com/w320/at.png" },
    country_bangladesh: { name: "Bangladesh", flag: "https://flagcdn.com/w320/bd.png" },
    country_egypt: { name: "Egypt", flag: "https://flagcdn.com/w320/eg.png" },
    country_greece: { name: "Greece", flag: "https://flagcdn.com/w320/gr.png" },
    country_new_zealand: { name: "New Zealand", flag: "https://flagcdn.com/w320/nz.png" },
    country_spain: { name: "Spain", flag: "https://flagcdn.com/w320/es.png" },
    country_syria: { name: "Syria", flag: "https://flagcdn.com/w320/sy.png" },
    country_vietnam: { name: "Vietnam", flag: "https://flagcdn.com/w320/vn.png" },
    country_germany_weimar_republic: { name: "Weimar Republic", flag: "https://flagcdn.com/w320/de.png" },
    country_brazil: { name: "Brazil", flag: "https://flagcdn.com/w320/br.png" },
    country_colombia: { name: "Colombia", flag: "https://flagcdn.com/w320/co.png" },
    country_cuba: { name: "Cuba", flag: "https://flagcdn.com/w320/cu.png" },
    country_iran: { name: "Iran", flag: "https://flagcdn.com/w320/ir.png" },
    country_ireland: { name: "Ireland", flag: "https://flagcdn.com/w320/ie.png" },
    country_jordan: { name: "Jordan", flag: "https://flagcdn.com/w320/jo.png" },
    country_kazakhstan: { name: "Kazakhstan", flag: "https://flagcdn.com/w320/kz.png" },
    country_kuwait: { name: "Kuwait", flag: "https://flagcdn.com/w320/kw.png" },
    country_lithuania: { name: "Lithuania", flag: "https://flagcdn.com/w320/lt.png" },
    country_north_korea: { name: "North Korea", flag: "https://flagcdn.com/w320/kp.png" },
    country_oman: { name: "Oman", flag: "https://flagcdn.com/w320/om.png" },
    country_philippines: { name: "Philippines", flag: "https://flagcdn.com/w320/ph.png" },
    country_portugal: { name: "Portugal", flag: "https://flagcdn.com/w320/pt.png" },
    country_saudi_arabia: { name: "Saudi Arabia", flag: "https://flagcdn.com/w320/sa.png" },
    country_serbia: { name: "Serbia", flag: "https://flagcdn.com/w320/rs.png" },
    country_singapore: { name: "Singapore", flag: "https://flagcdn.com/w320/sg.png" },
    country_slovakia: { name: "Slovakia", flag: "https://flagcdn.com/w320/sk.png" },
    country_south_vietnam: { name: "South Vietnam", flag: "https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_South_Vietnam.svg?width=320" },
    country_venezuela: { name: "Venezuela", flag: "https://flagcdn.com/w320/ve.png" },
};

const NAME_TO_COUNTRY: Record<string, { name: string; flag: string; }> = {};
for (const info of Object.values(COUNTRY_INFO)) NAME_TO_COUNTRY[info.name.toLowerCase()] = info;
Object.assign(NAME_TO_COUNTRY, {
    "united kingdom": COUNTRY_INFO.country_britain,
    "uk": COUNTRY_INFO.country_britain,
    "united states": COUNTRY_INFO.country_usa,
    "netherlands": COUNTRY_INFO.country_netherlands,
    "west germany": COUNTRY_INFO.country_germany_modern,
    "east germany": COUNTRY_INFO.country_gdr,
    "taiwan": COUNTRY_INFO.country_republic_china,
    "iriaf": COUNTRY_INFO.country_iran,
    "iaf": COUNTRY_INFO.country_israel,
    "idf": COUNTRY_INFO.country_israel,
    "raaf": COUNTRY_INFO.country_australia,
    "rocaf": COUNTRY_INFO.country_republic_china,
});

const FORCE_SUFFIXES: [string, { name: string; flag: string; }][] = [
    ["_iriaf", COUNTRY_INFO.country_iran],
    ["_iaf", COUNTRY_INFO.country_israel],
    ["_idf", COUNTRY_INFO.country_israel],
    ["_raaf", COUNTRY_INFO.country_australia],
    ["_rocaf", COUNTRY_INFO.country_republic_china],
];

const ID_SUFFIXES: [string, { name: string; flag: string; }][] = [
    ...Object.entries(COUNTRY_INFO)
        .map(([tag, info]) => ["_" + tag.slice("country_".length), info] as [string, { name: string; flag: string; }]),
    ...FORCE_SUFFIXES,
].sort((a, b) => b[0].length - a[0].length);

const OPERATOR_OVERRIDES: Record<string, { name: string; flag: string; }> = {
    jf_17: COUNTRY_INFO.country_pakistan,
    a_5c: COUNTRY_INFO.country_pakistan,
};

function prettifyCountryTag(tag: string) {
    return tag
        .replace(/^country_/, "")
        .split("_")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function parseOperator(html: string): { name: string; flag: string; } | undefined {
    let tag = html.match(/game-unit_template-flag"[^>]*src="[^"]*unit_tooltip\/(country_[a-z0-9_]+)\.png"/i)?.[1];

    if (!tag) {
        const idx = html.indexOf(">Operator<");
        if (idx > 0) {
            const before = html.slice(Math.max(0, idx - 600), idx);
            const matches = [...before.matchAll(/country_([a-z0-9_]+)\.(?:svg|png)/gi)];
            if (matches.length) tag = "country_" + matches[matches.length - 1][1];
        }
    }

    if (!tag) return undefined;

    return {
        name: COUNTRY_INFO[tag]?.name ?? prettifyCountryTag(tag),
        flag: `https://static.encyclopedia.warthunder.com/unit_tooltip/${tag}.png`,
    };
}

function detectOperator(name: string, unitId: string) {
    const override = OPERATOR_OVERRIDES[unitId];
    if (override) return override;

    for (const [suffix, info] of ID_SUFFIXES) {
        if (unitId.endsWith(suffix)) return info;
    }

    const paren = name.match(/\(([^()]+)\)\s*$/);
    if (paren) {
        const hit = NAME_TO_COUNTRY[paren[1].trim().toLowerCase()];
        if (hit) return hit;
    }

    return undefined;
}


function get(url: string, redirects = 0): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const req = request(url, { method: "GET" }, res => {
            const code = res.statusCode ?? 0;

            if (code >= 300 && code < 400 && res.headers.location && redirects < MAX_REDIRECTS) {
                res.resume();
                resolve(get(new URL(res.headers.location, url).toString(), redirects + 1));
                return;
            }

            if (code < 200 || code >= 300) {
                res.resume();
                reject(new Error(`HTTP ${code}`));
                return;
            }

            const chunks: Buffer[] = [];
            res.on("data", c => chunks.push(Buffer.from(c)));
            res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        });

        req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("Request timed out")));
        req.on("error", reject);
        req.end();
    });
}

interface UnitMeta { country?: string; type?: string; }

let metaByUnit: Map<string, UnitMeta> | null = null;
let metaPromise: Promise<void> | null = null;
let metaFailedAt = 0;

function prettifyTypeTag(tag: string) {
    return tag
        .replace(/^type_/, "")
        .split("_")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

async function ensureUnitMeta() {
    if (metaByUnit) return;
    if (Date.now() - metaFailedAt < DATAMINE_RETRY_MS) return;

    metaPromise ??= (async () => {
        try {
            const json = JSON.parse(await get(UNITTAGS_URL));
            const map = new Map<string, UnitMeta>();

            for (const [unitId, entry] of Object.entries<any>(json)) {
                const tags = Object.keys(entry?.tags ?? {});
                const country = tags.find(t => t.startsWith("country_"));

                const typeTag = tags
                    .filter(t => t.startsWith("type_"))
                    .sort((a, b) => b.length - a.length)[0];

                if (country || typeTag) {
                    map.set(unitId, {
                        country,
                        type: typeTag ? prettifyTypeTag(typeTag) : undefined,
                    });
                }
            }

            metaByUnit = map;
        } catch {
            metaFailedAt = Date.now();
        } finally {
            metaPromise = null;
        }
    })();

    await metaPromise;
}


export interface BattleRatings { ab: string; rb: string; sb: string; }

let brByUnit: Map<string, BattleRatings> | null = null;
let brPromise: Promise<void> | null = null;
let brFailedAt = 0;

function rankToBr(rank: unknown): string | undefined {
    if (typeof rank !== "number") return undefined;
    return (rank / 3 + 1).toFixed(1);
}

async function ensureBattleRatings() {
    if (brByUnit) return;
    if (Date.now() - brFailedAt < DATAMINE_RETRY_MS) return;

    brPromise ??= (async () => {
        try {
            try {
                const cached = JSON.parse(await readFile(BR_CACHE_FILE, "utf8"));
                if (cached?.savedAt && Date.now() - cached.savedAt < BR_CACHE_TTL_MS && cached.data) {
                    brByUnit = new Map(Object.entries<BattleRatings>(cached.data));
                    return;
                }
            } catch {
            }

            const json = JSON.parse(await get(WPCOST_URL));
            const data: Record<string, BattleRatings> = {};

            for (const [unitId, entry] of Object.entries<any>(json)) {
                if (!entry || typeof entry !== "object") continue;

                const ab = rankToBr(entry.economicRankArcade);
                const rb = rankToBr(entry.economicRankHistorical);
                const sb = rankToBr(entry.economicRankSimulation);
                if (ab && rb && sb) data[unitId] = { ab, rb, sb };
            }

            brByUnit = new Map(Object.entries(data));
            writeFile(BR_CACHE_FILE, JSON.stringify({ savedAt: Date.now(), data })).catch(() => {});
        } catch {
            brFailedAt = Date.now();
        } finally {
            brPromise = null;
        }
    })();

    await brPromise;
}


const NAMES_URL = "https://raw.githubusercontent.com/gszabi99/War-Thunder-Datamine/master/lang.vromfs.bin_u/lang/units.csv";
const NAMES_CACHE_FILE = join(tmpdir(), "vencord-warthunderrpc-names-cache-v2.json");
const NAMES_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

let idByName: Map<string, string> | null = null;
let namesPromise: Promise<void> | null = null;
let namesFailedAt = 0;

async function ensureUnitNames() {
    if (idByName) return;
    if (Date.now() - namesFailedAt < DATAMINE_RETRY_MS) return;

    namesPromise ??= (async () => {
        try {
            try {
                const cached = JSON.parse(await readFile(NAMES_CACHE_FILE, "utf8"));
                if (cached?.savedAt && Date.now() - cached.savedAt < NAMES_CACHE_TTL_MS && cached.data) {
                    idByName = new Map(Object.entries<string>(cached.data));
                    return;
                }
            } catch {
            }

            const csv = await get(NAMES_URL);
            const data: Record<string, string> = {};

            for (const line of csv.split("\n")) {
                if (!line.startsWith('"') || line.includes('"<ID')) continue;

                const fields = line.replace(/^"/, "").split('";"');
                const key = fields[0];
                if (!key || key.includes("/")) continue;

                let unitId: string | undefined;
                let priority = false;
                if (key.endsWith("_shop")) { unitId = key.slice(0, -5); priority = true; }
                else if (key.endsWith("_0") || key.endsWith("_1") || key.endsWith("_2")) unitId = key.slice(0, -2);
                if (!unitId) continue;

                for (const name of [fields[1], fields[4]]) {
                    const clean = name?.trim().toLowerCase();
                    if (!clean) continue;
                    if (priority || !data[clean]) data[clean] = unitId;
                }
            }

            idByName = new Map(Object.entries(data));
            writeFile(NAMES_CACHE_FILE, JSON.stringify({ savedAt: Date.now(), data })).catch(() => {});
        } catch {
            namesFailedAt = Date.now();
        } finally {
            namesPromise = null;
        }
    })();

    await namesPromise;
}

export async function resolveUnitIdByName(_: IpcMainInvokeEvent, displayName: string): Promise<string> {
    const name = String(displayName ?? "").trim().toLowerCase();
    if (!name) return "";
    await ensureUnitNames();
    return idByName?.get(name) ?? "";
}


function titleToVehicleName(title: string) {
    return title
        .replace(/\s*\|\s*War Thunder Wiki\s*$/i, "")
        .replace(/\s*-\s*War Thunder Wiki\s*$/i, "")
        .replace(/\s*\(War Thunder Wiki\)\s*$/i, "")
        .trim();
}

function parseName(html: string) {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
    return titleToVehicleName((match?.[1] ?? "").trim());
}

function parseMetaContent(html: string, property: string): string | undefined {
    const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
    const propRe = new RegExp(`(?:property|name)\\s*=\\s*["']?${property.replace(":", "\\:")}["']?`, "i");

    for (const tag of tags) {
        if (!propRe.test(tag)) continue;
        const content = tag.match(/content\s*=\s*["']([^"']+)["']/i);
        const url = content?.[1]?.trim();
        if (url) return url;
    }

    return undefined;
}

export interface VehicleInfo {
    name: string;
    images: string[];
    wikiUrl: string;
    flag?: string;
    nation?: string;
    type?: string;
    br?: BattleRatings;
}

export async function resolveVehicleInfo(_: IpcMainInvokeEvent, vehicleId: string): Promise<VehicleInfo> {
    const id = String(vehicleId ?? "").trim();
    if (!id) return { name: UNKNOWN, images: [], wikiUrl: "" };

    const wikiUrl = `${WIKI_BASE}${encodeURIComponent(id)}`;
    const encyclopediaImage = `${ENCYCLOPEDIA_IMG}${encodeURIComponent(id)}.png`;

    const [, , htmlResult] = await Promise.allSettled([
        ensureUnitMeta(),
        ensureBattleRatings(),
        get(wikiUrl),
    ]);

    const meta = metaByUnit?.get(id);
    const treeCountry = meta?.country ? COUNTRY_INFO[meta.country] : undefined;
    const br = brByUnit?.get(id);

    if (htmlResult.status === "fulfilled") {
        const html = htmlResult.value;
        const ogImage = parseMetaContent(html, "og:image");
        const name = parseName(html) || UNKNOWN;

        const country = parseOperator(html) ?? detectOperator(name, id) ?? treeCountry;

        const images = [encyclopediaImage];
        if (ogImage && /^https?:\/\//i.test(ogImage)) images.push(ogImage);

        return { name, images, wikiUrl, flag: country?.flag, nation: country?.name, type: meta?.type, br };
    }

    const country = detectOperator("", id) ?? treeCountry;
    return { name: UNKNOWN, images: [encyclopediaImage], wikiUrl, flag: country?.flag, nation: country?.name, type: meta?.type, br };
}

export async function isWarThunderRunning(_: IpcMainInvokeEvent) {
    return new Promise<boolean>(resolve => {
        execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true }, (err, stdout) => {
            if (err) {
                resolve(false);
                return;
            }

            const list = String(stdout || "").toLowerCase();
            resolve(list.includes("\"aces.exe\"") || list.includes("\"aces64.exe\""));
        });
    });
}

export async function pushWidgetProfile(
    _: IpcMainInvokeEvent,
    appId: string,
    userId: string,
    botToken: string,
    bodyJson: string,
): Promise<{ ok: boolean; status?: number; error?: string; }> {
    return new Promise(resolve => {
        const url = `https://discord.com/api/v9/applications/${encodeURIComponent(appId)}/users/${encodeURIComponent(userId)}/identities/0/profile`;

        const req = request(url, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyJson),
                "Authorization": `Bot ${botToken}`,
                "User-Agent": "DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)",
            },
        }, res => {
            const code = res.statusCode ?? 0;
            res.resume();
            res.on("end", () => resolve({ ok: code >= 200 && code < 300, status: code }));
        });

        req.setTimeout(TIMEOUT_MS, () => {
            req.destroy();
            resolve({ ok: false, error: "timeout" });
        });
        req.on("error", e => resolve({ ok: false, error: String(e) }));
        req.write(bodyJson);
        req.end();
    });
}
