/* Exercise tab: weight-training planner + tracker (routines, live workout, rest timer, history, records). */
(() => {
"use strict";
const H = window.HG, $ = H.$, esc = H.esc, num = H.num;
const D = () => H.data;
const uid = () => crypto.randomUUID?.() || "x" + Date.now() + Math.random().toString(16).slice(2, 8);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- Exercise library ---------- */
const LIB = [
  ["Barbell Back Squat", "Legs"], ["Goblet Squat", "Legs"], ["Front Squat", "Legs"], ["Leg Press", "Legs"], ["Romanian Deadlift", "Legs"],
  ["Deadlift", "Back"], ["Dumbbell Lunge", "Legs"], ["Bulgarian Split Squat", "Legs"], ["Leg Extension", "Legs"], ["Leg Curl", "Legs"],
  ["Hip Thrust", "Legs"], ["Standing Calf Raise", "Legs"], ["Step-Up", "Legs"],
  ["Barbell Bench Press", "Chest"], ["Dumbbell Bench Press", "Chest"], ["Incline Dumbbell Press", "Chest"], ["Incline Barbell Press", "Chest"],
  ["Chest Fly", "Chest"], ["Cable Crossover", "Chest"], ["Push-Up", "Chest"], ["Chest Dip", "Chest"],
  ["Barbell Row", "Back"], ["Dumbbell Row", "Back"], ["Seated Cable Row", "Back"], ["Lat Pulldown", "Back"], ["Pull-Up", "Back"], ["Chin-Up", "Back"],
  ["T-Bar Row", "Back"], ["Face Pull", "Shoulders"], ["Back Extension", "Back"],
  ["Overhead Press", "Shoulders"], ["Dumbbell Shoulder Press", "Shoulders"], ["Lateral Raise", "Shoulders"], ["Rear Delt Fly", "Shoulders"], ["Barbell Shrug", "Shoulders"],
  ["Barbell Curl", "Arms"], ["Dumbbell Curl", "Arms"], ["Hammer Curl", "Arms"], ["Triceps Pushdown", "Arms"], ["Skull Crusher", "Arms"], ["Overhead Triceps Extension", "Arms"], ["Close-Grip Bench Press", "Arms"],
  ["Plank", "Core"], ["Cable Crunch", "Core"], ["Hanging Knee Raise", "Core"], ["Ab Wheel Rollout", "Core"], ["Russian Twist", "Core"], ["Farmer's Carry", "Core"],
  ["Kettlebell Swing", "Full Body"], ["Rowing Machine", "Cardio"], ["Incline Treadmill Walk", "Cardio"], ["Stationary Bike", "Cardio"]
];
const BUILTIN = LIB.map(([name, group]) => ({ id: "ex-" + slug(name), name, group }));
const exById = id => BUILTIN.find(e => e.id === id) || (D().exercises[id] ? { id, ...D().exercises[id] } : { id, name: "(removed exercise)", group: "" });
const allEx = () => [...BUILTIN, ...Object.entries(D().exercises).map(([id, e]) => ({ id, ...e }))].sort((a, b) => a.name.localeCompare(b.name));

const STARTERS = [
  { id: "rt-fullbody-a", name: "Full Body A", items: [["goblet-squat", 3, "10"], ["dumbbell-bench-press", 3, "10"], ["seated-cable-row", 3, "10"], ["hip-thrust", 3, "10"]] },
  { id: "rt-fullbody-b", name: "Full Body B", items: [["romanian-deadlift", 3, "10"], ["overhead-press", 3, "8"], ["lat-pulldown", 3, "10"], ["leg-press", 3, "10"]] }
].map(r => ({ ...r, items: r.items.map(([s, sets, reps]) => ({ ex: "ex-" + s, sets, reps })) }));

/* ---------- Data helpers ---------- */
const W = () => D().workouts;
const active = () => Object.entries(W()).filter(([, w]) => w && !w.end).sort((a, b) => b[1].start - a[1].start)[0] || null;
const finished = () => Object.entries(W()).filter(([, w]) => w && w.end).sort((a, b) => b[1].start - a[1].start);
const e1rm = (w, r) => !(r > 0) ? 0 : !(w > 0) ? 0 : r === 1 ? w : w * (1 + r / 30);
const doneSets = x => x.sets.filter(s => s.done);
const volume = w => w.ex.reduce((t, x) => t + doneSets(x).reduce((a, s) => a + (s.w || 0) * (s.r || 0), 0), 0);
const setCount = w => w.ex.reduce((t, x) => t + doneSets(x).length, 0);

function prevSets(exId, excludeId) {
  for (const [id, w] of finished()) {
    if (id === excludeId) continue;
    const x = w.ex.find(x => x.e === exId);
    if (x && doneSets(x).length) return doneSets(x);
  }
  return [];
}
function bestE1(exId, excludeId) {
  let best = 0;
  for (const [id, w] of finished()) {
    if (id === excludeId) continue;
    for (const x of w.ex) if (x.e === exId) for (const s of doneSets(x)) best = Math.max(best, e1rm(s.w, s.r));
  }
  return best;
}
function recomputeLift(date) {
  const n = finished().filter(([, w]) => w.date === date).length;
  const key = "lift|" + date;
  if (n > 0) { D().metrics[key] = n; H.applyMetricDate("lift", date); }
  else { D().metrics[key] = 0; H.applyMetricDate("lift", date); delete D().metrics[key]; }
}
const blankSet = t => ({ w: null, r: null, t: t || null, done: false });
const fmtTime = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0"); };
const setLabel = s => (s.w ? num(s.w, 1) + "×" : "") + s.r;

/* ---------- Rendering ---------- */
function build() {
  $("panel-exercise").innerHTML = '<div id="wk-cardio"></div><div id="wk-main"></div><div id="wk-hist"></div>';
  renderCardio(); renderMain(); renderHist();
}
function update() { renderCardio(); }

function renderCardio() {
  const el = $("wk-cardio");
  if (!el) return;
  const walk = H.window7("walk", H.logDate), sum = walk.reduce((a, b) => a + b, 0);
  const wk = finished().filter(([, w]) => w.date > H.addDays(H.logDate, -7) && w.date <= H.logDate);
  const vol = wk.reduce((t, [, w]) => t + volume(w), 0);
  const keep = document.activeElement?.id === "m-walk";
  if (!el.firstChild) el.innerHTML = '<section class="card"><div class="gridtitle"><b>Walk / cardio</b><small>Saved per day</small></div><div class="metrics">' + H.field("walk") +
    '</div><div id="cardiobars"></div><div class="trends" id="exTiles"></div></section>';
  else if (!keep) { const i = $("m-walk"); if (i) i.value = H.mval("walk", H.logDate) ?? ""; }
  $("cardiobars").innerHTML = H.progress("Last 7 days", sum, H.S("walkWeek"), "min", "min");
  $("exTiles").innerHTML = H.tile(wk.length, "Lifting sessions (7d)", "Target 2–3 per week", wk.length >= 2) + H.tile(num(vol), "Volume lifted (7d, lb)", wk.reduce((t, [, w]) => t + setCount(w), 0) + " sets", false);
}

function renderMain() {
  const el = $("wk-main");
  if (!el) return;
  const act = active();
  el.innerHTML = (act ? activeHTML(act[0], act[1]) : "") + routinesHTML(!!act);
  tickClock();
}

function activeHTML(id, w) {
  let h = '<section class="card" data-wk="' + id + '"><div class="wkbar"><input data-act="wname" value="' + esc(w.name) + '" maxlength="40" aria-label="Workout name"><span class="wkclock" id="wkclock"></span><button class="action" data-act="finish">Finish</button></div>';
  w.ex.forEach((x, ei) => {
    const ex = exById(x.e), prev = prevSets(x.e, id);
    h += '<div class="ex"><div class="exhead"><b>' + esc(ex.name) + '</b><span><button class="mini" data-act="exup" data-ei="' + ei + '" aria-label="Move up">↑</button><button class="mini" data-act="exdown" data-ei="' + ei + '" aria-label="Move down">↓</button><button class="mini danger" data-act="exdel" data-ei="' + ei + '">Remove</button></span></div>' +
      '<table class="sets"><thead><tr><th>SET</th><th>PREVIOUS</th><th>LB</th><th>REPS</th><th></th></tr></thead><tbody>';
    x.sets.forEach((s, si) => {
      const p = prev[si] || null;
      h += '<tr class="' + (s.done ? "done" : "") + '"><td class="n">' + (si + 1) + '</td><td class="prev">' + (p ? esc(setLabel(p)) : "—") + '</td>' +
        '<td><input data-f="w" data-ei="' + ei + '" data-si="' + si + '" inputmode="decimal" value="' + (s.w ?? "") + '" placeholder="' + (p?.w ?? "") + '" aria-label="Weight set ' + (si + 1) + '"></td>' +
        '<td><input data-f="r" data-ei="' + ei + '" data-si="' + si + '" inputmode="numeric" value="' + (s.r ?? "") + '" placeholder="' + (p?.r ?? s.t ?? "") + '" aria-label="Reps set ' + (si + 1) + '"></td>' +
        '<td class="ck"><button data-act="done" data-ei="' + ei + '" data-si="' + si + '" aria-label="Mark set ' + (si + 1) + ' done" aria-pressed="' + !!s.done + '">✓</button></td></tr>';
    });
    h += '</tbody></table><button class="mini" data-act="addset" data-ei="' + ei + '">+ Add set</button><button class="mini danger" data-act="delset" data-ei="' + ei + '">− Remove last set</button></div>';
  });
  h += '<div class="wkbar"><button class="secondary wide" data-act="addex">+ Add exercise</button></div>' +
    '<div class="wkbar"><input data-act="wnote" placeholder="Workout notes" value="' + esc(w.note || "") + '"></div>' +
    '<div class="wkbar"><button class="secondary danger wide" data-act="discard">Discard workout</button></div></section>';
  return h;
}

function routinesHTML(busy) {
  const rs = Object.entries(D().routines).filter(([, r]) => r).sort((a, b) => a[1].name.localeCompare(b[1].name));
  let h = '<section class="card"><div class="gridtitle"><b>Workouts</b><small>' + H.short(H.logDate) + "</small></div>";
  h += '<div class="wkbar"><button class="action wide" data-act="start"' + (busy ? " disabled" : "") + ">" + (busy ? "Workout in progress" : "Start empty workout") + "</button></div><div class=\"rlist\">";
  for (const [id, r] of rs) {
    const summary = r.items.map(i => esc(exById(i.ex).name) + " " + i.sets + "×" + esc(i.reps || "")).join(" · ");
    h += '<div class="rrow"><div><b>' + esc(r.name) + "</b><small>" + (summary || "No exercises yet") + '</small></div><div class="b"><button class="secondary" data-act="startr" data-r="' + id + '"' + (busy ? " disabled" : "") + '>Start</button><button class="secondary" data-act="editr" data-r="' + id + '">Edit</button></div></div>';
  }
  h += '</div><div class="wkbar"><button class="secondary wide" data-act="newr">+ New routine</button></div>';
  if (STARTERS.some(s => !D().routines[s.id])) h += '<div class="wkbar"><button class="secondary wide" data-act="starters">Add starter routines (Full Body A &amp; B)</button></div>';
  return h + "</section>";
}

let histLimit = 15;
function renderHist() {
  const el = $("wk-hist");
  if (!el) return;
  const list = finished();
  let h = '<section class="card"><div class="gridtitle"><b>History</b><small>' + list.length + " workouts</small></div><div class=\"hist\">";
  if (!list.length) h += '<div class="empty">No finished workouts yet.</div>';
  for (const [id, w] of list.slice(0, histLimit)) {
    h += '<details><summary><span><b>' + esc(w.name) + "</b> <small>" + H.short(w.date) + '</small></span><small>' + setCount(w) + " sets · " + num(volume(w)) + " lb</small></summary><ul>" +
      w.ex.map(x => "<li>" + esc(exById(x.e).name) + ": " + doneSets(x).map(s => esc(setLabel(s))).join(", ") + "</li>").join("") + "</ul>" +
      (w.note ? "<small>" + esc(w.note) + "</small>" : "") +
      '<div class="b"><button class="secondary" data-act="repeat" data-w="' + id + '">Repeat</button><button class="secondary danger" data-act="delw" data-w="' + id + '">Delete</button></div></details>';
  }
  if (list.length > histLimit) h += '<button class="mini" data-act="more">Show more</button>';
  h += "</div></section>";
  // Records
  const rec = {};
  for (const [, w] of list) for (const x of w.ex) for (const s of doneSets(x)) {
    const r = rec[x.e] ||= { best: 0, score: -1, set: null, max: 0 };
    const v = e1rm(s.w, s.r), score = v > 0 ? v : (s.r || 0) / 1000;
    if (score > r.score) { r.score = score; r.best = v; r.set = s; }
    r.max = Math.max(r.max, s.w || 0);
  }
  const keys = Object.keys(rec).sort((a, b) => exById(a).name.localeCompare(exById(b).name));
  h += '<details class="card"><summary class="gridtitle"><b>Records</b><small>' + keys.length + " exercises</small></summary><div class=\"hist\">" +
    (keys.length ? keys.map(k => '<div class="rrow"><div><b>' + esc(exById(k).name) + "</b><small>Best set " + esc(setLabel(rec[k].set)) + (rec[k].max ? " · heaviest " + num(rec[k].max, 1) + " lb" : "") + "</small></div><b>" + (rec[k].best > 0 ? "~" + num(rec[k].best) + " lb" : rec[k].set.r + " reps") + "</b></div>").join("") + '<small class="hint">Right-hand number is estimated one-rep max (Epley).</small>' : '<div class="empty">Records appear after your first finished workout.</div>') + "</div></details>";
  el.innerHTML = h;
}

/* ---------- Workout actions ---------- */
function startWorkout(routineId, from) {
  if (active()) return;
  const r = routineId && D().routines[routineId];
  const id = uid();
  const ex = from ? from.ex.map(x => ({ e: x.e, sets: x.sets.filter(s => s.done).map(s => blankSet(s.r ? String(s.r) : null)) })) :
    r ? r.items.map(it => ({ e: it.ex, sets: Array.from({ length: Math.max(1, it.sets || 3) }, () => blankSet(it.reps)) })) : [];
  W()[id] = { date: H.logDate, name: from ? from.name : r ? r.name : "Workout", start: Date.now(), end: null, note: "", routine: routineId || null, ex };
  H.save(); renderMain();
}

function summaryFor(w) {
  const prs = [];
  w.ex.forEach(x => {
    const prior = bestE1(x.e, null);
    const best = Math.max(0, ...doneSets(x).map(s => e1rm(s.w, s.r)));
    if (prior > 0 && best > prior) prs.push(exById(x.e).name + " — est. 1RM " + num(best) + " lb");
  });
  return prs;
}
function finishWorkout(id) {
  const w = W()[id];
  w.ex.forEach(x => { x.sets = x.sets.filter(s => s.done); });
  w.ex = w.ex.filter(x => x.sets.length);
  if (!w.ex.length) {
    if (!confirm("No completed sets. Discard this workout?")) return renderMain();
    delete W()[id]; H.save(); hideRest(); return renderMain();
  }
  const prs = summaryFor(w);
  w.end = Date.now();
  recomputeLift(w.date);
  H.save(); hideRest();
  $("sumhead").textContent = w.name + " saved";
  $("sumbody").innerHTML = "<p>" + fmtTime(w.end - w.start) + " · " + w.ex.length + " exercises · " + setCount(w) + " sets · " + num(volume(w)) + " lb</p>" +
    (prs.length ? "<p><b>New records</b></p><ul>" + prs.map(p => "<li>" + esc(p) + "</li>").join("") + "</ul>" : "") +
    "<p><small>Your Lift weights habit for " + H.short(w.date) + " is checked if it is linked ⚡.</small></p>";
  $("summary").showModal();
  renderMain(); renderHist(); renderCardio();
}

/* ---------- Rest timer + clock ---------- */
let restEnd = 0, restTimer = null, finTimer = null;
function showRest(sec) {
  restEnd = Date.now() + sec * 1000;
  $("rest").classList.remove("fin"); $("rest").hidden = false;
  clearTimeout(finTimer); clearInterval(restTimer);
  restTimer = setInterval(tickRest, 250); tickRest();
}
function hideRest() { clearInterval(restTimer); clearTimeout(finTimer); $("rest").hidden = true; }
function tickRest() {
  const left = restEnd - Date.now();
  if (left <= 0) {
    clearInterval(restTimer);
    $("resttime").textContent = "Go!"; $("rest").classList.add("fin");
    try { navigator.vibrate?.(200); } catch {}
    finTimer = setTimeout(hideRest, 3000);
  } else $("resttime").textContent = fmtTime(left + 999);
}
$("restminus").onclick = () => { restEnd -= 15000; tickRest(); };
$("restplus").onclick = () => { restEnd += 15000; if ($("rest").classList.contains("fin")) showRest((restEnd - Date.now()) / 1000); else tickRest(); };
$("restskip").onclick = hideRest;
function tickClock() {
  const a = active(), el = $("wkclock");
  if (a && el) el.textContent = fmtTime(Date.now() - a[1].start);
}
setInterval(tickClock, 1000);

/* ---------- Exercise picker ---------- */
let pickCb = null;
const GROUPS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core", "Full Body", "Cardio", "Custom"];
let pickGroup = "All";
function renderPick() {
  const q = $("pickq").value.trim().toLowerCase();
  const pool = allEx().filter(e => (pickGroup === "All" || e.group === pickGroup) && (!q || e.name.toLowerCase().includes(q)));
  const present = GROUPS.filter(g => allEx().some(e => e.group === g));
  $("pickgroups").innerHTML = ["All", ...present].map(g => '<button type="button" role="tab" data-g="' + g + '" aria-selected="' + (g === pickGroup) + '">' + g + "</button>").join("");
  let h = "";
  if (q && !allEx().some(e => e.name.toLowerCase() === q)) h += '<button type="button" class="new" data-new="1">+ Create “' + esc($("pickq").value.trim()) + "”</button>";
  for (const g of [...GROUPS, ...new Set(pool.map(e => e.group).filter(g => !GROUPS.includes(g)))]) {
    const items = pool.filter(e => e.group === g);
    if (!items.length) continue;
    h += "<h4>" + esc(g) + "</h4>" + items.map(e => '<button type="button" data-ex="' + esc(e.id) + '">' + esc(e.name) + "</button>").join("");
  }
  $("picklist").innerHTML = h || '<div class="empty">No matches.</div>';
}
$("pickgroups").addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (b) { pickGroup = b.dataset.g; renderPick(); } });
function pickExercise(cb) { pickCb = cb; pickGroup = "All"; $("pickq").value = ""; renderPick(); $("pick").showModal(); }
$("pickq").addEventListener("input", renderPick);
$("pickcancel").onclick = () => $("pick").close();
$("picklist").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  let id = b.dataset.ex;
  if (b.dataset.new) {
    id = "cx-" + uid().slice(0, 8);
    D().exercises[id] = { name: $("pickq").value.trim().slice(0, 50), group: "Custom" };
    H.save();
  }
  if (!id) return;
  $("pick").close();
  pickCb?.(id);
});

/* ---------- Routine editor ---------- */
let draft = null;
function renderDraft() {
  $("ritems").innerHTML = draft.items.map((it, i) => '<div class="ri"><span>' + esc(exById(it.ex).name) + '</span>' +
    '<input data-ri="sets" data-i="' + i + '" type="number" inputmode="numeric" min="1" max="20" value="' + it.sets + '" aria-label="Sets">×' +
    '<input data-ri="reps" data-i="' + i + '" value="' + esc(it.reps || "") + '" placeholder="reps" maxlength="8" aria-label="Reps">' +
    '<button type="button" class="mini" data-rm="-1" data-i="' + i + '" aria-label="Move up">↑</button><button type="button" class="mini" data-rm="1" data-i="' + i + '" aria-label="Move down">↓</button>' +
    '<button type="button" class="mini danger" data-rm="del" data-i="' + i + '" aria-label="Remove">✕</button></div>').join("") || '<div class="hint">No exercises yet.</div>';
}
function openRoutine(id) {
  const r = id ? D().routines[id] : null;
  draft = { id: id || null, name: r?.name || "", items: r ? r.items.map(i => ({ ...i })) : [] };
  $("routineheading").textContent = id ? "Edit routine" : "New routine";
  $("rname").value = draft.name;
  $("rdelete").hidden = !id;
  renderDraft();
  $("routine").showModal();
}
$("ritems").addEventListener("change", e => {
  const f = e.target.closest("[data-ri]");
  if (!f) return;
  const it = draft.items[Number(f.dataset.i)];
  if (f.dataset.ri === "sets") it.sets = Math.max(1, Math.min(20, Math.round(Number(f.value)) || 1)); else it.reps = f.value.trim();
});
$("ritems").addEventListener("click", e => {
  const b = e.target.closest("[data-rm]");
  if (!b) return;
  const i = Number(b.dataset.i), m = b.dataset.rm;
  if (m === "del") draft.items.splice(i, 1);
  else { const j = i + Number(m); if (j >= 0 && j < draft.items.length) [draft.items[i], draft.items[j]] = [draft.items[j], draft.items[i]]; }
  renderDraft();
});
$("raddex").onclick = () => pickExercise(id => { draft.items.push({ ex: id, sets: 3, reps: "10" }); renderDraft(); });
$("rcancel").onclick = () => $("routine").close();
$("rdelete").onclick = () => {
  if (!draft.id || !confirm("Delete this routine? Past workouts are kept.")) return;
  delete D().routines[draft.id]; H.save(); $("routine").close(); renderMain();
};
$("routineform").onsubmit = e => {
  e.preventDefault();
  const name = $("rname").value.trim();
  if (!name) return;
  const id = draft.id || "rt-" + uid().slice(0, 8);
  D().routines[id] = { name, items: draft.items };
  H.save(); $("routine").close(); renderMain();
};
$("sumok").onclick = () => $("summary").close();

/* ---------- Event delegation for the Exercise panel ---------- */
const panel = $("panel-exercise");
panel.addEventListener("change", e => {
  const a = active();
  if (!a) return;
  const [id, w] = a;
  if (e.target.dataset.act === "wname") { w.name = e.target.value.trim() || "Workout"; H.save(); return; }
  if (e.target.dataset.act === "wnote") { w.note = e.target.value.trim(); H.save(); return; }
  const f = e.target.dataset.f;
  if (!f) return;
  const s = w.ex[Number(e.target.dataset.ei)]?.sets[Number(e.target.dataset.si)];
  if (!s) return;
  const raw = e.target.value.trim(), v = raw === "" ? null : Number(raw);
  s[f] = v !== null && isFinite(v) && v >= 0 ? v : null;
  H.save();
});
panel.addEventListener("click", e => {
  const b = e.target.closest("button[data-act]");
  if (!b || b.disabled) return;
  const act = b.dataset.act, ei = Number(b.dataset.ei), si = Number(b.dataset.si);
  const a = active(), w = a?.[1], id = a?.[0];
  switch (act) {
    case "start": return startWorkout();
    case "startr": return startWorkout(b.dataset.r);
    case "newr": return openRoutine();
    case "editr": return openRoutine(b.dataset.r);
    case "starters":
      for (const s of STARTERS) if (!D().routines[s.id]) D().routines[s.id] = { name: s.name, items: s.items.map(i => ({ ...i })) };
      H.save(); return renderMain();
    case "more": histLimit += 15; return renderHist();
    case "repeat": return W()[b.dataset.w] && startWorkout(null, W()[b.dataset.w]);
    case "delw": {
      const x = W()[b.dataset.w];
      if (!x || !confirm("Delete this workout?")) return;
      delete W()[b.dataset.w]; recomputeLift(x.date); H.save(); renderHist(); renderCardio(); return;
    }
  }
  if (!w) return;
  if (act === "done") {
    const s = w.ex[ei].sets[si], prev = prevSets(w.ex[ei].e, id)[si];
    if (!s.done) {
      if (s.w == null && prev?.w != null) s.w = prev.w;
      if (s.r == null && prev?.r != null) s.r = prev.r;
      if (s.r == null) { const t = parseInt(s.t, 10); if (t > 0) s.r = t; }
      if (s.r == null) { panel.querySelector('input[data-f="r"][data-ei="' + ei + '"][data-si="' + si + '"]')?.focus(); return; }
      s.done = true; showRest(H.S("restSec"));
    } else s.done = false;
    H.save(); return renderMain();
  }
  if (act === "addset") { const x = w.ex[ei]; x.sets.push(blankSet(x.sets[x.sets.length - 1]?.t)); H.save(); return renderMain(); }
  if (act === "delset") { const x = w.ex[ei]; if (x.sets.length > 1) x.sets.pop(); H.save(); return renderMain(); }
  if (act === "exdel") { w.ex.splice(ei, 1); H.save(); return renderMain(); }
  if (act === "exup" || act === "exdown") {
    const j = ei + (act === "exup" ? -1 : 1);
    if (j >= 0 && j < w.ex.length) { [w.ex[ei], w.ex[j]] = [w.ex[j], w.ex[ei]]; H.save(); renderMain(); }
    return;
  }
  if (act === "addex") return pickExercise(exId => { const cur = active(); if (!cur) return; cur[1].ex.push({ e: exId, sets: [blankSet(), blankSet(), blankSet()] }); H.save(); renderMain(); });
  if (act === "finish") return finishWorkout(id);
  if (act === "discard") { if (!confirm("Discard this workout?")) return; delete W()[id]; H.save(); hideRest(); renderMain(); }
});

window.HGWorkout = { build, update };
if (H.tab === "exercise") build();
})();
