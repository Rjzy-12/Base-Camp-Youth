const db = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toDate(d) { return new Date(String(d).length === 10 ? d + "T00:00:00" : d); }
function fmtDate(d) { return toDate(d).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }); }
function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":"); const hr = +h;
  return `${((hr + 11) % 12) + 1}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}
function slug(s) { return String(s).toLowerCase().replace(/\s+/g, "-"); }
function notice(el, kind, msg) { el.innerHTML = `<div class="notice ${kind}" role="status">${esc(msg)}</div>`; }
function setupMissing() { return APP_CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-ID"); }


/* ---------- icons (inline SVG, inherit color) ---------- */
const svg = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  tent: svg('<path d="M3 20 12 4l9 16"/><path d="M12 4v16"/><path d="m8.5 20 3.5-7 3.5 7"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  vote: svg('<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>'),
  bulb: svg('<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2Z"/>'),
  megaphone: svg('<path d="m3 11 18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>'),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  chat: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"/>'),
  up: svg('<path d="m12 19V5M5 12l7-7 7 7"/>'),
  trophy: svg('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1.2 1.2C7.8 18.7 7 20.2 7 22M14 14.7V17c0 .6.5 1 1.2 1.2 1 .5 1.8 2 1.8 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'),
  pin: svg('<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>')
};

/* anonymous device id: lets us allow one vote per device without accounts */
function voterKey() {
  try {
    let k = localStorage.getItem("bc_voter");
    if (!k) { k = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)); localStorage.setItem("bc_voter", k); }
    return k;
  } catch (e) { return "session-" + (window.__vk = window.__vk || Math.random().toString(36).slice(2, 14)); }
}
function saveName(n) { try { localStorage.setItem("bc_name", n); } catch (e) {} }
function savedName() { try { return localStorage.getItem("bc_name") || ""; } catch (e) { return ""; } }

function toast(msg, kind) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.className = "toast show " + (kind || "");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 3200);
}

const AVATAR_COLORS = ["#2C5740", "#2A6F94", "#B36B00", "#7B4B94", "#B3402A", "#3E7A59", "#4B5BA6"];
function avatar(name) {
  const n = (name || "Anonymous").trim() || "Anonymous";
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) | 0;
  const initials = n.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return `<span class="avatar" style="background:${AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]}" aria-hidden="true">${esc(initials)}</span>`;
}
function ago(d) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60); if (h < 24) return h + " hr ago";
  const dd = Math.floor(h / 24); if (dd < 7) return dd + " day" + (dd > 1 ? "s" : "") + " ago";
  return fmtDate(d);
}
function fmtDateTime(d) {
  return new Date(d).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
// Close any poll whose deadline has passed (also posts the result announcement)
async function finalizeDue() { try { await db.rpc("finalize_due_polls"); } catch (e) { console.warn(e); } }

function renderShell(active) {
  if (!$("link[rel=icon]")) document.head.insertAdjacentHTML("beforeend", '<link rel="icon" type="image/png" href="images/favicon.png">');
  const links = [
    ["index.html", "Home"], ["announcements.html", "Announcements"], ["events.html", "Events"],
    ["request.html", "Request a document"], ["register.html", "Youth registry"], ["feedback.html", "Feedback"]
  ];
  $("#site-header").innerHTML = `<div class="wrap">
    <a class="brand" href="index.html"><i><img src="images/sk-logo.png" alt="" width="50" height="50"></i>Base Camp Youth</a>
    <nav class="nav" aria-label="Main">${links.map(([h, t]) =>
      `<a href="${h}" ${h === active ? 'aria-current="page"' : ""}>${t}</a>`).join("")}</nav></div>`;
  $("#site-footer").innerHTML = `<div class="wrap">
    <div class="brand"><i><img src="images/sk-logo.png" alt="" width="50" height="50"></i>Base Camp Youth</div>
    Official Youth Information Platform of Barangay Base Camp, Maramag, Bukidnon.<br>
    A mini capstone project of Torres Capitol College, Inc. &nbsp;|&nbsp; <a href="admin.html">Staff login</a></div>`;
  if (setupMissing()) {
    const m = document.createElement("div");
    m.className = "notice err wrap"; m.style.margin = "16px auto";
    m.textContent = "Setup needed: open js/config.js and paste your Supabase URL and anon key.";
    $("#site-header").after(m);
  }
}

function announcementCard(a) {
  return `<article class="card ${a.pinned ? "pinned" : ""}">
    <div class="meta"><span class="tag ${a.category === "Poll Results" ? "ok" : a.pinned ? "sun" : ""}">${a.category === "Poll Results" ? ICON.trophy : a.pinned ? ICON.pin : ""}${esc(a.pinned && a.category !== "Poll Results" ? "Pinned" : a.category)}</span>${fmtDate(a.created_at)}</div>
    <h3>${esc(a.title)}</h3>
    <p style="white-space:pre-line;margin:0">${esc(a.body)}</p></article>`;
}

function eventCard(e, registered, withButton = true) {
  const d = toDate(e.event_date);
  const left = e.slots == null ? null : Math.max(0, e.slots - (registered || 0));
  const full = left === 0;
  const time = e.start_time ? fmtTime(e.start_time) + (e.end_time ? " to " + fmtTime(e.end_time) : "") : "";
  return `<article class="card"><div class="event-date">
    <div class="d"><b>${d.getDate()}</b><span>${d.toLocaleDateString("en-PH", { month: "short" })}</span></div>
    <div><h3>${esc(e.title)}</h3>
      <div class="meta">${[esc(e.location), time].filter(Boolean).join(", ")}</div>
      ${e.description ? `<p style="margin:0 0 10px">${esc(e.description)}</p>` : ""}
      ${left == null ? `<span class="tag">Open to all</span>` : `<span class="tag ${full ? "" : "sun"}">${full ? "Full" : left + " slots left"}</span>`}
      ${withButton ? `<div style="margin-top:10px"><button class="btn btn-sm" data-register="${e.id}" data-title="${esc(e.title)}" ${full ? "disabled" : ""}>${full ? "Registration closed" : "Register"}</button></div>` : ""}
    </div></div></article>`;
}

async function loadUpcomingEvents(limit) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let q = db.from("events").select("*").gte("event_date", iso).order("event_date").order("start_time");
  if (limit) q = q.limit(limit);
  const [{ data: events, error }, { data: counts }] = await Promise.all([q, db.rpc("event_counts")]);
  if (error) throw error;
  const map = Object.fromEntries((counts || []).map(c => [c.evt_id, Number(c.registered)]));
  return { events: events || [], map };
}

// Re-run `cb` whenever one of the tables changes (Supabase Realtime)
function onLive(tables, cb) {
  try {
    let t;
    const run = () => { clearTimeout(t); t = setTimeout(cb, 400); };
    const ch = db.channel("live-" + tables.join("-"));
    tables.forEach(table => ch.on("postgres_changes", { event: "*", schema: "public", table }, run));
    ch.subscribe();
  } catch (e) { console.warn("Live updates unavailable", e); }
}
