import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { ApplicationAssetUtils, FluxDispatcher } from "@webpack/common";

const APP_ID = "1480182808507973812";
const API_BASE = "http://127.0.0.1:8111";
const TICK_MS = 2000;
const UNKNOWN = "Unknown Vehicle";
const LARGE_FALLBACK = "mp:https://warthunder.com/i/opengraph-wt.jpg";
const LARGE_KEYS = ["warthunderlogo", "warthunder", "logo", "main", "icon"];

const settings = definePluginSettings({
  showState: {
    type: OptionType.BOOLEAN,
    description: "Show In Match / In Hangar",
    default: true,
  },
  unknownNameFallback: {
    type: OptionType.SELECT,
    description: "Vehicle name source",
    options: [
      { label: "Wiki name", value: "wiki", default: true },
      { label: "Raw /indicators type", value: "raw" },
    ],
  },
});

const Native = VencordNative.pluginHelpers.WarThunderRPC as PluginNative<typeof import("./native")>;

let interval: NodeJS.Timeout | null = null;
let matchStart = Date.now();
let wasRunning = false;
let largeImage: string | undefined;
const nameCache = new Map<string, string>();

function pushActivity(activity: any) {
  FluxDispatcher.dispatch({
    type: "LOCAL_ACTIVITY_UPDATE",
    activity,
    socketId: "WarThunderRPC",
  });
}

async function readJson(path: string) {
  try {
    const res = await fetch(`${API_BASE}/${path}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function unitIdFromType(rawType: string) {
  if (!rawType) return "";
  const tail = rawType.split("/").pop() ?? rawType;
  return tail.split("?")[0].split("#")[0].replace(/^['\"]+|['\"]+$/g, "").trim();
}

async function getLargeImage() {
  if (largeImage) return largeImage;

  for (const key of LARGE_KEYS) {
    try {
      const [id] = await ApplicationAssetUtils.fetchAssetIds(APP_ID, [key]);
      if (id) {
        largeImage = id;
        return id;
      }
    } catch {
    }
  }

  return undefined;
}

async function resolveName(rawType: string) {
  if (settings.store.unknownNameFallback === "raw") {
    return rawType || UNKNOWN;
  }

  const unitId = unitIdFromType(rawType);
  if (!unitId) return UNKNOWN;

  const cached = nameCache.get(unitId);
  if (cached) return cached;

  try {
    const name = (await Native.resolveVehicleName(unitId)).trim();
    if (name && name !== UNKNOWN) {
      nameCache.set(unitId, name);
      return name;
    }
  } catch {
  }

  return UNKNOWN;
}

async function tick() {
  const running = await Native.isWarThunderRunning();
  if (!running) {
    wasRunning = false;
    pushActivity(null);
    return;
  }

  if (!wasRunning) {
    wasRunning = true;
    matchStart = Date.now();
  }

  const [indicators, mapInfo] = await Promise.all([
    readJson("indicators"),
    readJson("map_info.json"),
  ]);

  const rawType = String(indicators?.type ?? "").trim();
  const vehicleName = await resolveName(rawType);
  const inMatch = Boolean(mapInfo?.valid);
  const large = (await getLargeImage()) ?? LARGE_FALLBACK;

  pushActivity({
    application_id: APP_ID,
    name: "War Thunder",
    details: `Using: ${vehicleName}`,
    state: settings.store.showState ? (inMatch ? "In Match" : "In Hangar") : undefined,
    timestamps: inMatch ? { start: matchStart } : undefined,
    assets: {
      large_image: large,
      large_text: "War Thunder",
    },
    type: 0,
    flags: 1,
  });
}

export default definePlugin({
  name: "WarThunderRPC",
  description: "War Thunder rich presence",
  authors: [{ name: "Zockerwolf76", id: 0n }],
  settings,

  async start() {
    await tick();
    interval = setInterval(tick, TICK_MS);
  },

  stop() {
    if (interval) clearInterval(interval);
    interval = null;
    wasRunning = false;
    pushActivity(null);
  },
});
