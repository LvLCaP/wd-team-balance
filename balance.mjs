const MESSAGES = [
  "Привілеї на цей сервер можна придбати: wardogs-help.com",
  "Наш сайт: https://wardogs-help.com",
  "Долучайся до спільноти в Discord: discord.gg/9rGM7Vps84",
  "You can chat in any language.",
  "Важкі образи заборонені.",
];
const OPEN = ["Valkyra", "Manticore"];
const CAP = 50;
const step = Math.min(60_000, Math.max(5_000, Number(process.env.BALANCE_MS) || 15_000));
const until = Date.now() + Math.min(6 * 60 * 60 * 1000, Math.max(60_000, Number(process.env.BALANCE_FOR_MS) || 330 * 60 * 1000));

const base = String(process.env.WDRCON_URL || "").trim().replace(/\/$/, "");
const password = String(process.env.WDRCON_PASSWORD || "").trim();

function headers(json) {
  const out = { authorization: `Bearer ${password}`, accept: "application/json" };
  if (json) out["content-type"] = "application/json";
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function players() {
  const res = await fetch(`${base}/v1/players`, { headers: headers(false) });
  if (!res.ok) throw new Error(`players ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.players) ? data.players : [];
}

async function balance(list) {
  const counts = { Valkyra: 0, Manticore: 0 };
  for (const player of list) {
    if (counts[player.faction] != null) counts[player.faction] += 1;
  }
  const movers = list.filter((player) => !OPEN.includes(player.faction));
  for (const team of OPEN) {
    const surplus = counts[team] - CAP;
    if (surplus > 0) movers.push(...list.filter((player) => player.faction === team).slice(0, surplus));
  }
  function lighter() {
    if (counts.Valkyra <= counts.Manticore && counts.Valkyra < CAP) return "Valkyra";
    if (counts.Manticore < CAP) return "Manticore";
    return counts.Valkyra <= counts.Manticore ? "Valkyra" : "Manticore";
  }
  let movedCount = 0;
  for (const player of movers) {
    const target = lighter();
    if (!player.steamId || player.faction === target) continue;
    const moved = await fetch(`${base}/v1/players/${encodeURIComponent(player.steamId)}`, {
      method: "PATCH",
      headers: headers(true),
      body: JSON.stringify({ faction: target }),
    });
    if (!moved.ok) {
      console.error(`move failed ${player.faction || "?"} -> ${target} ${moved.status}`);
      continue;
    }
    movedCount += 1;
    console.log(`moved ${player.faction || "?"} -> ${target}`);
    if (counts[player.faction] != null) counts[player.faction] -= 1;
    counts[target] += 1;
  }
  return { online: list.length, moved: movedCount, counts };
}

if (!base || !password) {
  console.error("missing rcon env");
  process.exit(1);
}

let lastReport = 0;
let announcedSlot = -1;

async function announce() {
  const slot = Math.floor(Date.now() / (15 * 60 * 1000));
  if (slot === announcedSlot) return;
  const message = MESSAGES[slot % MESSAGES.length];
  const res = await fetch(`${base}/v1/broadcast`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`broadcast ${res.status}`);
  announcedSlot = slot;
  console.log(`broadcast ${message}`);
}

while (Date.now() < until) {
  try {
    const list = await players();
    const result = await balance(list);
    await announce();
    if (result.moved || Date.now() - lastReport > 5 * 60 * 1000) {
      console.log(`online ${result.online} moved ${result.moved} ${JSON.stringify(result.counts)}`);
      lastReport = Date.now();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "balance failed");
  }
  await sleep(step);
}

console.log("shift done");
