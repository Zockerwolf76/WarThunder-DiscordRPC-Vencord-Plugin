import { execFile } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import { request } from "https";

const WIKI_BASE = "https://wiki.warthunder.com/unit/";
const UNKNOWN = "Unknown Vehicle";

function get(url: string) {
  return new Promise<string>((resolve, reject) => {
    const req = request(url, { method: "GET" }, res => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`HTTP ${res.statusCode ?? 0}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", c => chunks.push(Buffer.from(c)));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

    req.on("error", reject);
    req.end();
  });
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

export async function resolveVehicleName(_: IpcMainInvokeEvent, vehicleId: string) {
  const id = String(vehicleId ?? "").trim();
  if (!id) return UNKNOWN;

  try {
    const html = await get(`${WIKI_BASE}${encodeURIComponent(id)}`);
    return parseName(html) || UNKNOWN;
  } catch {
    return UNKNOWN;
  }
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
