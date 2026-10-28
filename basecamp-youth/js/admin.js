/* Staff dashboard: login, requests, announcements, events, feedback */
const app = $("#app");
const REQUEST_STATUSES = ["Pending", "Processing", "Ready for pickup", "Released", "Rejected"];
const FEEDBACK_STATUSES = ["New", "Read", "Resolved"];
const CATEGORIES = ["General", "Youth Program", "Sports", "Seminar", "Health", "Notice", "Poll Results"];
const SUG_STATUSES = ["Open", "Under review", "Planned", "Declined"];
let pollFormOpts = 3;
let tab = "overview";
let editingAnn = null, editingEvent = null;

function toCSV(rows, cols) {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.map(c => q(c.label)).join(","), ...rows.map(r => cols.map(c => q(r[c.key])).join(","))].join("\n");
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + text], { type: "text/csv" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------- login ---------- */
function showLogin(msg) {
  app.innerHTML = `<div class="card login-box">
    <h2>Staff login</h2>
    <p class="muted small">For Barangay and SK officials only.</p>
    <form class="form" id="loginForm" style="max-width:none">
      <label>Email <input type="email" name="email" required autocomplete="username"></label>
      <label>Password <input type="password" name="password" required autocomplete="current-password"></label>
      <div id="loginMsg">${msg ? `<div class="notice err">${esc(msg)}</div>` : ""}</div>
      <div><button class="btn" type="submit">Log in</button></div>
    </form></div>`;
  $("#loginForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const { data, error } = await db.auth.signInWithPassword({ email: f.get("email").trim(), password: f.get("password") });
    if (error) { notice($("#loginMsg"), "err", "Wrong email or password."); return; }
    await enter(data.user);
  });
}

async function enter(user) {
  const { data } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) {
    await db.auth.signOut();
    showLogin("This account is not an approved staff account. Ask the system administrator to add you.");
    return;
  }
  renderDashboard();
}

/* ---------- dashboard shell ---------- */
function renderDashboard() {
  const tabs = [["overview", "Overview"], ["requests", "Document requests"], ["announcements", "Announcements"], ["events", "Events"], ["polls", "Polls"], ["ideas", "Ideas"], ["registry", "Youth registry"], ["feedback", "Feedback"]];
  app.innerHTML = `<div class="admin-bar"><h1 style="font-size:2rem;margin:0">Staff dashboard</h1>
    <button class="btn btn-line btn-sm" id="logout">Log out</button></div>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join("")}</div>
    <div id="panel">Loading...</div>`;
  $("#logout").onclick = async () => { await db.auth.signOut(); showLogin(); };
  $$(".tab").forEach(b => b.onclick = () => { tab = b.dataset.tab; renderDashboard(); });
  ({ overview: loadOverview, requests: loadRequests, announcements: loadAnnouncements, events: loadEvents, polls: loadPolls, ideas: loadIdeas, registry: loadRegistry, feedback: loadFeedback })[tab]();
}

const count = async (table, filter) => {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c } = await q; return c ?? 0;
};

/* ---------- overview ---------- */
async function loadOverview() {
  const [pending, processing, regs, newFb, anns, evs, youth, youthPending, openPolls, ideasN] = await Promise.all([
    count("document_requests", q => q.eq("status", "Pending")),
    count("document_requests", q => q.eq("status", "Processing")),
    count("event_registrations"),
    count("feedback", q => q.eq("status", "New")),
    count("announcements"), count("events"),
    count("youth_profiles", q => q.eq("approval", "Approved")),
    count("youth_profiles", q => q.eq("approval", "Pending")),
    count("polls", q => q.eq("status", "open")), count("suggestions")
  ]);
  const s = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  $("#panel").innerHTML = `<div class="stats">
    ${s(pending, "Pending requests")}${s(processing, "Requests in process")}${s(newFb, "New feedback")}
    ${s(regs, "Event registrations")}${s(anns, "Announcements")}${s(evs, "Events")}
    ${s(youth, "Registered youth")}${s(youthPending, "Profiles to review")}
    ${s(openPolls, "Polls open now")}${s(ideasN, "Youth ideas")}</div>
    <p class="muted">Use the tabs above to process document requests, post announcements, manage events, run polls, moderate ideas, and read feedback.</p>`;
}

/* ---------- requests ---------- */
async function loadRequests() {
  const { data, error } = await db.from("document_requests").select("*").order("created_at", { ascending: false });
  if (error) { $("#panel").innerHTML = '<div class="notice err">Could not load requests.</div>'; return; }
  let filter = "All";
  const draw = () => {
    const rows = data.filter(r => filter === "All" || r.status === filter);
    $("#reqRows").innerHTML = rows.length ? rows.map(r => `<tr data-id="${r.id}">
      <td><b>${esc(r.tracking_code)}</b><br><span class="small muted">${fmtDate(r.created_at)}</span></td>
      <td>${esc(r.full_name)}<br><span class="small muted">Age ${esc(r.age)}, ${esc(r.purok)}<br>${esc(r.contact)}</span></td>
      <td><b>${esc(r.doc_type)}</b><br><span class="small">${esc(r.purpose)}</span></td>
      <td><select class="st">${REQUEST_STATUSES.map(s => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td><input class="note" value="${esc(r.admin_note || "")}" placeholder="Note for resident" maxlength="300"></td>
      <td><button class="btn btn-sm save">Save</button></td></tr>`).join("") :
      `<tr><td colspan="6" class="muted">No requests here yet.</td></tr>`;
  };
  $("#panel").innerHTML = `<div class="toolbar">
      <label style="display:flex;gap:8px;align-items:center;font-weight:500">Show
        <select id="fStatus"><option>All</option>${REQUEST_STATUSES.map(s => `<option>${s}</option>`).join("")}</select></label>
      <button class="btn btn-line btn-sm" id="csv">Download CSV</button>
      <button class="btn btn-line btn-sm" onclick="print()">Print</button></div>
    <div class="table-wrap"><table><thead><tr><th>Code</th><th>Resident</th><th>Document</th><th>Status</th><th>Note</th><th></th></tr></thead>
    <tbody id="reqRows"></tbody></table></div><div id="msg" style="margin-top:12px"></div>`;
  draw();
  $("#fStatus").onchange = e => { filter = e.target.value; draw(); };
  $("#csv").onclick = () => download("document-requests.csv", toCSV(data, [
    { key: "tracking_code", label: "Code" }, { key: "full_name", label: "Name" }, { key: "age", label: "Age" },
    { key: "purok", label: "Purok" }, { key: "contact", label: "Contact" }, { key: "doc_type", label: "Document" },
    { key: "purpose", label: "Purpose" }, { key: "status", label: "Status" }, { key: "created_at", label: "Date sent" }]));
  $("#reqRows").onclick = async e => {
    const btn = e.target.closest(".save"); if (!btn) return;
    const tr = btn.closest("tr");
    const status = $(".st", tr).value, admin_note = $(".note", tr).value.trim() || null;
    const { error } = await db.from("document_requests").update({ status, admin_note, updated_at: new Date().toISOString() }).eq("id", tr.dataset.id);
    if (error) return notice($("#msg"), "err", "Could not save. Try again.");
    const row = data.find(r => r.id === tr.dataset.id); row.status = status; row.admin_note = admin_note;
    notice($("#msg"), "ok", "Saved.");
  };
}

/* ---------- announcements ---------- */
async function loadAnnouncements() {
  const { data, error } = await db.from("announcements").select("*").order("created_at", { ascending: false });
  if (error) { $("#panel").innerHTML = '<div class="notice err">Could not load announcements.</div>'; return; }
  const cur = data.find(a => a.id === editingAnn) || {};
  $("#panel").innerHTML = `<div class="two-col">
    <form class="form" id="annForm" style="max-width:none">
      <h2>${cur.id ? "Edit announcement" : "New announcement"}</h2>
      <label>Title <input name="title" required maxlength="200" value="${esc(cur.title || "")}"></label>
      <label>Category <select name="category">${CATEGORIES.map(c => `<option ${c === cur.category ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>Message <textarea name="body" required maxlength="5000">${esc(cur.body || "")}</textarea></label>
      <label class="check"><input type="checkbox" name="pinned" ${cur.pinned ? "checked" : ""}> Pin to the top</label>
      <label class="check"><input type="checkbox" name="published" ${cur.id ? (cur.published ? "checked" : "") : "checked"}> Visible to the public</label>
      <div id="msg"></div>
      <div class="btns" style="margin:0"><button class="btn" type="submit">${cur.id ? "Save changes" : "Post announcement"}</button>
        ${cur.id ? '<button class="btn btn-line" type="button" id="cancelEdit">Cancel</button>' : ""}</div>
    </form>
    <div class="stack">${data.map(a => `<article class="card ${a.pinned ? "pinned" : ""}">
      <div class="meta"><span class="tag">${esc(a.category)}</span>${a.published ? "" : '<span class="tag sun">Hidden</span>'}${fmtDate(a.created_at)}</div>
      <h3>${esc(a.title)}</h3>
      <div class="btns" style="margin-top:8px"><button class="btn btn-sm btn-line" data-edit="${a.id}">Edit</button>
      <button class="btn btn-sm btn-danger" data-del="${a.id}">Delete</button></div></article>`).join("") || '<p class="muted">No announcements yet.</p>'}</div></div>`;

  $("#annForm").onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const row = { title: f.get("title").trim(), category: f.get("category"), body: f.get("body").trim(),
      pinned: f.has("pinned"), published: f.has("published") };
    const { error } = cur.id ? await db.from("announcements").update(row).eq("id", cur.id) : await db.from("announcements").insert(row);
    if (error) return notice($("#msg"), "err", "Could not save the announcement.");
    editingAnn = null; loadAnnouncements();
  };
  const c = $("#cancelEdit"); if (c) c.onclick = () => { editingAnn = null; loadAnnouncements(); };
  $("#panel").onclick = async e => {
    const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
    if (ed) { editingAnn = ed.dataset.edit; loadAnnouncements(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (del && confirm("Delete this announcement? This cannot be undone.")) {
      await db.from("announcements").delete().eq("id", del.dataset.del); loadAnnouncements();
    }
  };
}

/* ---------- events ---------- */
async function loadEvents() {
  const [{ data, error }, { data: counts }] = await Promise.all([
    db.from("events").select("*").order("event_date", { ascending: false }), db.rpc("event_counts")]);
  if (error) { $("#panel").innerHTML = '<div class="notice err">Could not load events.</div>'; return; }
  const map = Object.fromEntries((counts || []).map(c => [c.evt_id, Number(c.registered)]));
  const cur = data.find(a => a.id === editingEvent) || {};
  $("#panel").innerHTML = `<div class="two-col">
    <form class="form" id="evForm" style="max-width:none">
      <h2>${cur.id ? "Edit event" : "New event"}</h2>
      <label>Title <input name="title" required maxlength="200" value="${esc(cur.title || "")}"></label>
      <label>Description <textarea name="description" maxlength="2000">${esc(cur.description || "")}</textarea></label>
      <label>Location <input name="location" maxlength="200" value="${esc(cur.location || "")}"></label>
      <label>Date <input type="date" name="event_date" required value="${esc(cur.event_date || "")}"></label>
      <div class="row"><label>Start time <input type="time" name="start_time" value="${esc((cur.start_time || "").slice(0, 5))}"></label>
        <label>End time <input type="time" name="end_time" value="${esc((cur.end_time || "").slice(0, 5))}"></label></div>
      <label>Slots <small>Leave blank for unlimited</small><input type="number" name="slots" min="1" value="${esc(cur.slots ?? "")}"></label>
      <div id="msg"></div>
      <div class="btns" style="margin:0"><button class="btn" type="submit">${cur.id ? "Save changes" : "Create event"}</button>
        ${cur.id ? '<button class="btn btn-line" type="button" id="cancelEdit">Cancel</button>' : ""}</div>
    </form>
    <div class="stack">${data.map(e => `<article class="card">
      <div class="meta">${fmtDate(e.event_date)} ${e.start_time ? ", " + fmtTime(e.start_time) : ""}</div>
      <h3>${esc(e.title)}</h3>
      <p class="small muted" style="margin:0 0 8px">${esc(e.location || "")} ${e.slots ? `| ${map[e.id] || 0} of ${e.slots} slots taken` : `| ${map[e.id] || 0} registered`}</p>
      <div class="btns" style="margin-top:8px">
        <button class="btn btn-sm" data-regs="${e.id}" data-title="${esc(e.title)}">Registrations</button>
        <button class="btn btn-sm btn-line" data-edit="${e.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-del="${e.id}">Delete</button></div></article>`).join("") || '<p class="muted">No events yet.</p>'}</div></div>`;

  $("#evForm").onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const row = { title: f.get("title").trim(), description: f.get("description").trim() || null,
      location: f.get("location").trim() || null, event_date: f.get("event_date"),
      start_time: f.get("start_time") || null, end_time: f.get("end_time") || null,
      slots: f.get("slots") ? +f.get("slots") : null };
    const { error } = cur.id ? await db.from("events").update(row).eq("id", cur.id) : await db.from("events").insert(row);
    if (error) return notice($("#msg"), "err", "Could not save the event.");
    editingEvent = null; loadEvents();
  };
  const c = $("#cancelEdit"); if (c) c.onclick = () => { editingEvent = null; loadEvents(); };
  $("#panel").onclick = async e => {
    const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]"), rg = e.target.closest("[data-regs]");
    if (ed) { editingEvent = ed.dataset.edit; loadEvents(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    if (del && confirm("Delete this event and all its registrations?")) {
      await db.from("events").delete().eq("id", del.dataset.del); loadEvents();
    }
    if (rg) showRegistrations(rg.dataset.regs, rg.dataset.title);
  };
}

async function showRegistrations(id, title) {
  const { data, error } = await db.from("event_registrations").select("*").eq("event_id", id).order("created_at");
  $("#regBody").innerHTML = error ? '<div class="notice err">Could not load registrations.</div>' : `
    <h2>${esc(title)}: ${data.length} registered</h2>
    <div class="toolbar"><button class="btn btn-line btn-sm" id="regCsv">Download CSV</button></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Age</th><th>Purok</th><th>Contact</th><th>Registered</th></tr></thead><tbody>
    ${data.map(r => `<tr><td>${esc(r.full_name)}</td><td>${esc(r.age)}</td><td>${esc(r.purok)}</td><td>${esc(r.contact)}</td><td>${fmtDate(r.created_at)}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No one has registered yet.</td></tr>'}
    </tbody></table></div>`;
  const csv = $("#regCsv");
  if (csv) csv.onclick = () => download("registrations.csv", toCSV(data, [
    { key: "full_name", label: "Name" }, { key: "age", label: "Age" }, { key: "purok", label: "Purok" },
    { key: "contact", label: "Contact" }, { key: "created_at", label: "Registered" }]));
  $("#regDlg").showModal();
}
$("#regClose").onclick = () => $("#regDlg").close();


/* ---------- polls ---------- */
const toLocalInput = d => { const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return x.toISOString().slice(0, 16); };

async function loadPolls() {
  await db.rpc("finalize_due_polls");
  const [{ data: polls, error }, { data: opts }] = await Promise.all([
    db.from("polls").select("*").order("created_at", { ascending: false }), db.from("poll_options").select("*").order("position")]);
  if (error) { $("#panel").innerHTML = '<div class="notice err">Could not load polls. Did you run database/update-2.sql?</div>'; return; }
  const res = {};
  await Promise.all(polls.map(async p => {
    const { data } = await db.rpc("poll_results", { p_poll: p.id });
    res[p.id] = Object.fromEntries((data || []).map(r => [r.option_id, Number(r.votes)]));
  }));
  const optRows = n => Array.from({ length: n }, (_, i) => `<div class="row" style="grid-template-columns:1.2fr 1fr">
      <input name="opt_label" placeholder="Option ${i + 1} (e.g. Sports Fest)" maxlength="160" ${i < 2 ? "required" : ""}>
      <input name="opt_detail" placeholder="Short detail (optional)" maxlength="500"></div>`).join("");
  const defEnd = toLocalInput(new Date(Date.now() + 3 * 86400000));

  $("#panel").innerHTML = `<div class="two-col">
    <form class="form card" id="pollForm" style="max-width:none">
      <h2>New poll</h2>
      <label>Question <input name="title" required minlength="3" maxlength="200" placeholder="Which event should we hold this December?"></label>
      <label>Description <small>Optional</small><textarea name="description" maxlength="2000"></textarea></label>
      <label>Voting ends <input type="datetime-local" name="ends_at" required value="${defEnd}"></label>
      <div><b style="font-size:.93rem">Choices</b> <span class="small muted">(2 to 6)</span></div>
      <div id="optBox" class="stack" style="gap:8px">${optRows(pollFormOpts)}</div>
      <div><button class="btn btn-line btn-sm" type="button" id="addOpt">+ Add choice</button></div>
      <label class="check"><input type="checkbox" name="announce" checked> Also post an announcement that voting is open</label>
      <div id="msg"></div>
      <button class="btn" type="submit">Publish poll</button>
    </form>
    <div class="stack">${polls.map(p => {
      const o = opts.filter(x => x.poll_id === p.id), r = res[p.id] || {}, total = Object.values(r).reduce((a, b) => a + b, 0);
      const closed = p.status === "closed";
      return `<article class="card" data-id="${p.id}">
        <div class="meta"><span class="status ${slug(p.status)}">${closed ? "Closed" : "Open"}</span>
          ${closed ? "Closed " + fmtDateTime(p.closed_at) : "Ends " + fmtDateTime(p.ends_at)}</div>
        <h3>${esc(p.title)}</h3>
        <div class="stack" style="gap:8px;margin:10px 0 12px">${o.map(x => {
          const v = r[x.id] || 0, pct = total ? Math.round(v * 100 / total) : 0;
          return `<div><div style="display:flex;justify-content:space-between;font-size:.9rem"><span>${esc(x.label)}</span><b>${pct}% <span class="muted" style="font-weight:400">(${v})</span></b></div>
            <div style="height:8px;background:var(--mist);border-radius:99px;overflow:hidden"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--pine-3),var(--sun));border-radius:99px"></div></div></div>`; }).join("")}</div>
        <p class="small muted" style="margin:0 0 10px">${total} vote${total === 1 ? "" : "s"} ${closed ? "" : "so far (hidden from the public until the poll ends)"}</p>
        <div class="btns" style="margin:0">
          ${closed ? "" : '<button class="btn btn-sm" data-end="1">End now &amp; announce</button>'}
          <button class="btn btn-sm btn-danger" data-del="1">Delete</button></div></article>`; }).join("") || '<div class="empty"><b>No polls yet</b>Create your first poll on the left.</div>'}</div></div>`;

  $("#addOpt").onclick = () => {
    const n = $$("#optBox .row").length; if (n >= 6) return;
    const vals = $$("#optBox input").map(i => i.value);
    pollFormOpts = n + 1; $("#optBox").innerHTML = optRows(pollFormOpts);
    $$("#optBox input").forEach((i, k) => i.value = vals[k] || "");
  };
  $("#pollForm").onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target), labels = f.getAll("opt_label"), details = f.getAll("opt_detail");
    const choices = labels.map((l, i) => ({ label: l.trim(), detail: details[i].trim() || null })).filter(c => c.label);
    if (choices.length < 2) return notice($("#msg"), "err", "Add at least two choices.");
    const ends = new Date(f.get("ends_at"));
    if (!(ends > new Date())) return notice($("#msg"), "err", "The end time must be in the future.");
    const { data: poll, error } = await db.from("polls").insert({ title: f.get("title").trim(), description: f.get("description").trim() || null, ends_at: ends.toISOString() }).select().single();
    if (error) return notice($("#msg"), "err", "Could not create the poll.");
    const { error: e2 } = await db.from("poll_options").insert(choices.map((c, i) => ({ ...c, poll_id: poll.id, position: i })));
    if (e2) { await db.from("polls").delete().eq("id", poll.id); return notice($("#msg"), "err", "Could not save the choices."); }
    if (f.has("announce")) {
      await db.from("announcements").insert({ title: "Vote now: " + poll.title, category: "Youth Program", pinned: false, published: true,
        body: "Youth of Base Camp, your voice decides! Go to the Events page, open the Polls tab, and cast your vote before " + fmtDateTime(ends) + ".\n\nChoices:\n" + choices.map(c => "- " + c.label).join("\n") });
    }
    pollFormOpts = 3; loadPolls();
  };
  $("#panel").onclick = async e => {
    const card = e.target.closest("[data-id]"); if (!card) return;
    if (e.target.closest("[data-end]") && confirm("End this poll now? The result announcement will be posted right away.")) {
      const { error } = await db.rpc("close_poll_now", { p_id: card.dataset.id });
      if (error) return notice($("#msg") || card, "err", "Could not end the poll.");
      loadPolls();
    }
    if (e.target.closest("[data-del]") && confirm("Delete this poll and all its votes? The announcement (if any) stays.")) {
      await db.from("polls").delete().eq("id", card.dataset.id); loadPolls();
    }
  };
}

/* ---------- ideas (suggestion threads) ---------- */
let ideaOpen = new Set();
async function loadIdeas() {
  const [{ data: sugs, error }, { data: cs }, { data: lc }] = await Promise.all([
    db.from("suggestions").select("*").order("created_at", { ascending: false }),
    db.from("suggestion_comments").select("*").order("created_at"), db.rpc("suggestion_like_counts")]);
  if (error) { $("#panel").innerHTML = '<div class="notice err">Could not load ideas. Did you run database/update-2.sql?</div>'; return; }
  const likes = Object.fromEntries((lc || []).map(x => [x.sug_id, Number(x.likes)]));
  const by = {}; (cs || []).forEach(c => (by[c.suggestion_id] = by[c.suggestion_id] || []).push(c));
  $("#panel").innerHTML = `<p class="muted small" style="margin-top:0">Ideas posted by the youth. Change a status so everyone can see what is happening, reply as staff, or hide anything inappropriate.</p>
  <div class="stack">${sugs.map(s => {
    const c = by[s.id] || [], open = ideaOpen.has(s.id);
    return `<article class="card" data-id="${s.id}">
      <div class="meta">${s.hidden ? '<span class="tag danger">Hidden</span>' : ""}<span class="status ${slug(s.status)}">${esc(s.status)}</span>
        ${esc(s.author_name || "Anonymous")} &middot; ${fmtDateTime(s.created_at)} &middot; ${likes[s.id] || 0} likes</div>
      <h3>${esc(s.title)}</h3><p style="white-space:pre-line;margin:0 0 12px">${esc(s.body)}</p>
      <div class="toolbar" style="margin:0">
        <select class="sst">${SUG_STATUSES.map(x => `<option ${x === s.status ? "selected" : ""}>${x}</option>`).join("")}</select>
        <button class="btn btn-sm btn-line" data-toggle="1">${open ? "Hide" : "View"} ${c.length} comment${c.length === 1 ? "" : "s"}</button>
        <button class="btn btn-sm btn-line" data-hide="${s.hidden ? 0 : 1}">${s.hidden ? "Unhide" : "Hide"}</button>
        <button class="btn btn-sm btn-danger" data-del="1">Delete</button></div>
      ${open ? `<div style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px" class="stack">${c.map(x => `<div class="meta" style="margin:0;align-items:flex-start;justify-content:space-between;flex-wrap:nowrap" data-cid="${x.id}">
          <span style="color:var(--ink)"><b>${esc(x.author_name || "Anonymous")}</b>${x.is_staff ? ' <span class="tag sun">Staff</span>' : ""}${x.hidden ? ' <span class="tag danger">Hidden</span>' : ""}<br>${esc(x.body)}</span>
          <span style="white-space:nowrap"><button class="btn btn-sm btn-line" data-chide="${x.hidden ? 0 : 1}">${x.hidden ? "Unhide" : "Hide"}</button> <button class="btn btn-sm btn-danger" data-cdel="1">Delete</button></span></div>`).join("")}
        <form class="cform" data-reply="1" style="margin-top:4px"><textarea name="body" required maxlength="1000" placeholder="Reply as SK staff..."></textarea><button class="btn btn-sm" type="submit">Reply</button></form></div>` : ""}
    </article>`; }).join("") || '<div class="empty"><b>No ideas yet</b>Ideas from the Events page will show up here.</div>'}</div><div id="msg" style="margin-top:12px"></div>`;

  $("#panel").onchange = async e => {
    const sel = e.target.closest(".sst"); if (!sel) return;
    const { error } = await db.from("suggestions").update({ status: sel.value }).eq("id", sel.closest("[data-id]").dataset.id);
    error ? notice($("#msg"), "err", "Could not update the status.") : (notice($("#msg"), "ok", "Status updated."), loadIdeas());
  };
  $("#panel").onclick = async e => {
    const card = e.target.closest("[data-id]"); if (!card) return;
    const id = card.dataset.id, cid = e.target.closest("[data-cid]");
    if (e.target.closest("[data-toggle]")) { ideaOpen.has(id) ? ideaOpen.delete(id) : ideaOpen.add(id); return loadIdeas(); }
    const h = e.target.closest("[data-hide]");
    if (h) { await db.from("suggestions").update({ hidden: h.dataset.hide === "1" }).eq("id", id); return loadIdeas(); }
    if (e.target.closest("[data-del]") && !cid && confirm("Delete this idea and all its comments?")) { await db.from("suggestions").delete().eq("id", id); return loadIdeas(); }
    const ch = e.target.closest("[data-chide]");
    if (ch && cid) { await db.from("suggestion_comments").update({ hidden: ch.dataset.chide === "1" }).eq("id", cid.dataset.cid); return loadIdeas(); }
    if (e.target.closest("[data-cdel]") && cid && confirm("Delete this comment?")) { await db.from("suggestion_comments").delete().eq("id", cid.dataset.cid); return loadIdeas(); }
  };
  $("#panel").onsubmit = async e => {
    const f = e.target.closest("[data-reply]"); if (!f) return; e.preventDefault();
    const id = f.closest("[data-id]").dataset.id, body = new FormData(f).get("body").trim();
    const { error } = await db.from("suggestion_comments").insert({ suggestion_id: id, author_name: "SK Staff", body, is_staff: true });
    error ? notice($("#msg"), "err", "Could not post the reply.") : loadIdeas();
  };
}

/* ---------- youth registry ---------- */
const YOUTH_STATUS = ["Student", "Employed", "Out of School Youth", "Other"];
const ageOf = b => {
  const d = new Date(b + "T00:00:00"), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
};
const bracketOf = a => a < 15 ? "Below 15" : a <= 17 ? "15 - 17" : a <= 24 ? "18 - 24" : a <= 30 ? "25 - 30" : "31 and above";

async function loadRegistry() {
  const { data, error } = await db.from("youth_profiles").select("*").order("created_at", { ascending: false });
  if (error) { $("#panel").innerHTML = '<div class="notice err">Could not load the registry. Did you run database/update-1.sql?</div>'; return; }
  const f = { q: "", purok: "All", bracket: "All", approval: "All" };
  const puroks = [...new Set(data.map(p => p.purok.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const opts = list => list.map(v => `<option>${esc(v)}</option>`).join("");
  $("#panel").innerHTML = `<div class="toolbar">
      <input id="rq" type="search" placeholder="Search name, contact, school" style="max-width:240px">
      <select id="rPurok"><option>All</option>${opts(puroks)}</select>
      <select id="rBracket"><option>All</option>${opts(["15 - 17", "18 - 24", "25 - 30", "31 and above", "Below 15"])}</select>
      <select id="rApproval"><option>All</option>${opts(["Pending", "Approved", "Rejected"])}</select>
      <button class="btn btn-sm" id="addProfile">Add youth</button>
      <button class="btn btn-line btn-sm" id="csv">Download CSV</button>
      <button class="btn btn-line btn-sm" onclick="print()">Print</button></div>
    <p class="small muted" id="rCount"></p>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Age</th><th>Sex</th><th>Purok</th><th>Contact</th><th>Status</th><th>SK</th><th>Approval</th><th></th></tr></thead>
    <tbody id="rRows"></tbody></table></div><div id="msg" style="margin-top:12px"></div>`;

  const visible = () => data.filter(p => {
    const text = (p.full_name + " " + (p.contact || "") + " " + (p.school_or_work || "")).toLowerCase();
    return (f.approval === "All" || p.approval === f.approval) && (f.purok === "All" || p.purok.trim() === f.purok) &&
      (f.bracket === "All" || bracketOf(ageOf(p.birthdate)) === f.bracket) && (!f.q || text.includes(f.q));
  }).sort((a, b) => (b.approval === "Pending") - (a.approval === "Pending"));

  const draw = () => {
    const rows = visible();
    $("#rCount").textContent = `Showing ${rows.length} of ${data.length} profiles`;
    $("#rRows").innerHTML = rows.length ? rows.map(p => `<tr data-id="${p.id}">
      <td><b>${esc(p.full_name)}</b><br><span class="small muted">${esc(p.school_or_work || "")}</span></td>
      <td>${ageOf(p.birthdate)}<br><span class="small muted">${fmtDate(p.birthdate)}</span></td>
      <td>${esc(p.sex)}</td><td>${esc(p.purok)}</td>
      <td>${esc(p.contact || "")}<br><span class="small muted">${esc(p.email || "")}</span></td>
      <td>${esc(p.status)}</td><td>${p.sk_member ? "Yes" : "No"}</td>
      <td><span class="status ${slug(p.approval)}">${esc(p.approval)}</span></td>
      <td style="white-space:nowrap">
        ${p.approval !== "Approved" ? '<button class="btn btn-sm" data-act="approve">Approve</button>' : ""}
        ${p.approval === "Pending" ? '<button class="btn btn-sm btn-line" data-act="reject">Reject</button>' : ""}
        <button class="btn btn-sm btn-line" data-act="edit">Edit</button>
        <button class="btn btn-sm btn-danger" data-act="del">Delete</button></td></tr>`).join("") :
      `<tr><td colspan="9" class="muted">No profiles match. Youth can register on the public Youth registry page, or you can add them yourself.</td></tr>`;
  };
  draw();
  $("#rq").oninput = e => { f.q = e.target.value.trim().toLowerCase(); draw(); };
  $("#rPurok").onchange = e => { f.purok = e.target.value; draw(); };
  $("#rBracket").onchange = e => { f.bracket = e.target.value; draw(); };
  $("#rApproval").onchange = e => { f.approval = e.target.value; draw(); };
  $("#addProfile").onclick = () => openProfile(null);
  $("#csv").onclick = () => download("youth-registry.csv", toCSV(visible().map(p => ({ ...p, age: ageOf(p.birthdate), sk: p.sk_member ? "Yes" : "No" })), [
    { key: "full_name", label: "Name" }, { key: "birthdate", label: "Birthdate" }, { key: "age", label: "Age" },
    { key: "sex", label: "Sex" }, { key: "purok", label: "Purok" }, { key: "contact", label: "Contact" },
    { key: "email", label: "Email" }, { key: "status", label: "Status" }, { key: "school_or_work", label: "School or workplace" },
    { key: "sk", label: "SK member" }, { key: "approval", label: "Approval" }]));

  $("#rRows").onclick = async e => {
    const btn = e.target.closest("[data-act]"); if (!btn) return;
    const id = btn.closest("tr").dataset.id, p = data.find(x => x.id === id);
    if (btn.dataset.act === "edit") return openProfile(p);
    if (btn.dataset.act === "del") {
      if (!confirm("Delete " + p.full_name + " from the registry? This cannot be undone.")) return;
      const { error } = await db.from("youth_profiles").delete().eq("id", id);
      if (error) return notice($("#msg"), "err", "Could not delete.");
      return loadRegistry();
    }
    const approval = btn.dataset.act === "approve" ? "Approved" : "Rejected";
    const { error } = await db.from("youth_profiles").update({ approval }).eq("id", id);
    if (error) return notice($("#msg"), "err", "Could not update.");
    p.approval = approval; draw(); notice($("#msg"), "ok", p.full_name + ": " + approval.toLowerCase() + ".");
  };
}

function openProfile(p) {
  const v = k => esc(p ? (p[k] ?? "") : "");
  const sel = (k, list) => list.map(o => `<option ${p && p[k] === o ? "selected" : ""}>${o}</option>`).join("");
  $("#profDlg").innerHTML = `<form class="form" id="profForm" style="max-width:none">
    <h2>${p ? "Edit youth profile" : "Add youth profile"}</h2>
    <label>Full name <input name="full_name" required minlength="2" maxlength="120" value="${v("full_name")}"></label>
    <div class="row"><label>Birthdate <input type="date" name="birthdate" required value="${v("birthdate")}"></label>
      <label>Sex <select name="sex">${sel("sex", ["Male", "Female"])}</select></label></div>
    <div class="row"><label>Purok <input name="purok" required maxlength="60" value="${v("purok")}"></label>
      <label>Contact <input name="contact" maxlength="60" value="${v("contact")}"></label></div>
    <label>Email <input type="email" name="email" maxlength="120" value="${v("email")}"></label>
    <div class="row"><label>Status <select name="status">${sel("status", YOUTH_STATUS)}</select></label>
      <label>School or workplace <input name="school_or_work" maxlength="160" value="${v("school_or_work")}"></label></div>
    <div class="row"><label>SK member <select name="sk_member"><option value="no">No</option><option value="yes" ${p && p.sk_member ? "selected" : ""}>Yes</option></select></label>
      <label>Approval <select name="approval">${sel("approval", ["Approved", "Pending", "Rejected"])}</select></label></div>
    <div id="pmsg"></div>
    <div class="btns" style="margin:0"><button class="btn" type="submit">${p ? "Save changes" : "Add to registry"}</button>
      <button class="btn btn-line" type="button" id="pcancel">Cancel</button></div></form>`;
  $("#pcancel").onclick = () => $("#profDlg").close();
  $("#profForm").onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const row = { full_name: f.get("full_name").trim(), birthdate: f.get("birthdate"), sex: f.get("sex"),
      purok: f.get("purok").trim(), contact: f.get("contact").trim() || null, email: f.get("email").trim() || null,
      status: f.get("status"), school_or_work: f.get("school_or_work").trim() || null,
      sk_member: f.get("sk_member") === "yes", approval: f.get("approval") };
    const { error } = p ? await db.from("youth_profiles").update(row).eq("id", p.id) : await db.from("youth_profiles").insert(row);
    if (error) return notice($("#pmsg"), "err", error.code === "23505" ? "This person is already in the registry." : "Could not save the profile.");
    $("#profDlg").close(); loadRegistry();
  };
  $("#profDlg").showModal();
}

/* ---------- feedback ---------- */
async function loadFeedback() {
  const { data, error } = await db.from("feedback").select("*").order("created_at", { ascending: false });
  if (error) { $("#panel").innerHTML = '<div class="notice err">Could not load feedback.</div>'; return; }
  $("#panel").innerHTML = `<div class="stack">${data.map(f => `<article class="card" data-id="${f.id}">
    <div class="meta"><span class="tag">${esc(f.kind)}</span><span class="status ${slug(f.status)}">${esc(f.status)}</span> ${fmtDate(f.created_at)}</div>
    <p style="white-space:pre-line;margin:0 0 8px">${esc(f.message)}</p>
    <p class="small muted" style="margin:0 0 10px">From: ${esc(f.full_name || "Anonymous")} ${f.contact ? "| " + esc(f.contact) : ""}</p>
    <div class="btns" style="margin:0">${FEEDBACK_STATUSES.filter(s => s !== f.status).map(s => `<button class="btn btn-sm btn-line" data-set="${s}">Mark ${s.toLowerCase()}</button>`).join("")}
    <button class="btn btn-sm btn-danger" data-del="1">Delete</button></div></article>`).join("") || '<p class="muted">No feedback yet.</p>'}</div>`;
  $("#panel").onclick = async e => {
    const card = e.target.closest("[data-id]"); if (!card) return;
    const set = e.target.closest("[data-set]"), del = e.target.closest("[data-del]");
    if (set) { await db.from("feedback").update({ status: set.dataset.set }).eq("id", card.dataset.id); loadFeedback(); }
    if (del && confirm("Delete this message?")) { await db.from("feedback").delete().eq("id", card.dataset.id); loadFeedback(); }
  };
}

/* ---------- start ---------- */
(async () => {
  if (setupMissing()) { app.innerHTML = '<div class="notice err">Open js/config.js and paste your Supabase URL and anon key first.</div>'; return; }
  const { data: { session } } = await db.auth.getSession();
  if (session) await enter(session.user); else showLogin();
})();
