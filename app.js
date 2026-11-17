(() => {
"use strict";
const KEY = "habitgrid.v1", TABKEY = "habitgrid.tab";
const $ = id => document.getElementById(id);

/* ---------- Model ---------- */
const DEFAULTS = { calMin: 2150, calMax: 2400, proteinMin: 140, fiberMin: 25, walkWeek: 150, sleepMin: 7, waistGoal: 40, restSec: 90 };

// tab says where the input lives; derived metrics are computed, never typed.
const METRICS = [
  { id: "weight",   tab: "body",      label: "Weight",        unit: "lb",   step: "0.1" },
  { id: "waist",    tab: "body",      label: "Waist",         unit: "in",   step: "0.1" },
  { id: "sleep",    tab: "body",      label: "Sleep",         unit: "h",    step: "0.1" },
  { id: "calories", tab: "nutrition", label: "Calories",      unit: "kcal", step: "1" },
  { id: "protein",  tab: "nutrition", label: "Protein",       unit: "g",    step: "1" },
  { id: "fiber",    tab: "nutrition", label: "Fiber",         unit: "g",    step: "1" },
  { id: "walk",     tab: "exercise",  label: "Walk / cardio", unit: "min",  step: "1" },
  { id: "lift",     tab: "exercise",  label: "Lifting sessions", unit: "", derived: true }
];
const METRIC = Object.fromEntries(METRICS.map(m => [m.id, m]));
const BLOBS = ["links", "settings", "routines", "exercises", "workouts"];

const initial = () => ({
  habits: [{ id: "h1", name: "Morning workout" }, { id: "h2", name: "Read" }, { id: "h3", name: "Study" }, { id: "h4", name: "Drink water" }],
  checks: {}, metrics: {}
});
function normalize(d) {
  d.metrics ||= {};
  for (const b of BLOBS) d[b] ||= {};
  return d;
}

let data;
try {
  const stored = JSON.parse(localStorage.getItem(KEY));
  data = stored && Array.isArray(stored.habits) && stored.checks ? stored : initial();
} catch { data = initial(); }
normalize(data);

const S = k => (typeof data.settings[k] === "number" ? data.settings[k] : DEFAULTS[k] ?? null);

/* ---------- Dates / formatting ---------- */
const pad = n => String(n).padStart(2, "0");
const fmt = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 0) => v === null || v === undefined || !isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d });
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const short = s => parse(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const now = new Date();
let year = now.getFullYear(), month = now.getMonth(), editing = null, logDate = fmt(now);
const gridDate = day => year + "-" + pad(month + 1) + "-" + pad(day);

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    window.dispatchEvent(new Event("habitgrid:change"));
  } catch { alert("Storage is unavailable. Your changes may not persist."); }
}

/* ---------- Metrics + auto-check ---------- */
const mval = (id, date) => {
  const v = data.metrics[id + "|" + date];
  return typeof v === "number" && isFinite(v) ? v : null;
};
const meets = (link, v) => (link.min == null || v >= link.min) && (link.max == null || v <= link.max);

function applyLink(habitId, date) {
  const link = data.links[habitId];
  if (!link) return;
  const v = mval(link.metric, date);
  if (v !== null) data.checks[habitId + "|" + date] = meets(link, v);
}
function applyMetricDate(metric, date) {
  for (const h of data.habits) if (data.links[h.id]?.metric === metric) applyLink(h.id, date);
}
function applyAllDates(habitId) {
  const link = data.links[habitId];
  if (!link) return;
  for (const k of Object.keys(data.metrics)) {
    const [m, d] = k.split("|");
    if (m === link.metric) applyLink(habitId, d);
  }
}
function lastValues(metric, end, span) {
  const out = [];
  for (let i = span - 1; i >= 0; i--) { const d = addDays(end, -i), v = mval(metric, d); if (v !== null) out.push({ d, v }); }
  return out;
}
const window7 = (metric, end) => lastValues(metric, end, 7).map(p => p.v);
const latest = (metric, end, span = 90) => { const a = lastValues(metric, end, span); return a.length ? a[a.length - 1] : null; };

/* ---------- Health plan (habits linked to numbers) ---------- */
const planItems = () => [
  { id: "hp-calories", name: "Calories " + num(S("calMin")) + "–" + num(S("calMax")), link: { metric: "calories", min: S("calMin"), max: S("calMax") } },
  { id: "hp-protein",  name: "Protein " + S("proteinMin") + "g+", link: { metric: "protein", min: S("proteinMin") } },
  { id: "hp-fiber",    name: "Fiber " + S("fiberMin") + "g+",     link: { metric: "fiber", min: S("fiberMin") } },
  { id: "hp-walk",     name: "Walk 20+ min",                      link: { metric: "walk", min: 20 } },
  { id: "hp-sleep",    name: "Sleep " + S("sleepMin") + "h+",     link: { metric: "sleep", min: S("sleepMin") } },
  { id: "hp-lift",     name: "Lift weights (2–3x/wk)",            link: { metric: "lift", min: 1 } },
  { id: "hp-liquid",   name: "No liquid calories" },
  { id: "hp-alcohol",  name: "No alcohol" }
];
const hasHabit = id => data.habits.some(h => h.id === id);

// Keep plan habits in step when targets change (only ones still linked).
function syncPlanLinks() {
  for (const p of planItems()) {
    if (!p.link || !hasHabit(p.id) || !data.links[p.id]) continue;
    data.links[p.id] = { ...p.link };
    const h = data.habits.find(h => h.id === p.id), base = p.name.split(" ")[0];
    if (h && h.name.startsWith(base)) h.name = p.name;
    applyAllDates(p.id);
  }
}
// One-time upgrade: the lifting habit now follows logged workouts.
function migrate() {
  if (data.settings._m1 || !hasHabit("hp-lift")) return false;
  data.settings._m1 = 1;
  if (!data.links["hp-lift"]) data.links["hp-lift"] = { metric: "lift", min: 1 };
  return true;
}
if (migrate()) save();

/* ---------- Tabs ---------- */
const TABS = ["habits", "body", "nutrition", "exercise"];
let tab = localStorage.getItem(TABKEY);
if (!TABS.includes(tab)) tab = "habits";

function build(t = tab) {
  if (t === "habits") drawGrid();
  else if (t === "body") buildBody();
  else if (t === "nutrition") buildNutrition();
  else window.HGWorkout?.build();
}
function update(t = tab) {
  if (t === "habits") drawGrid();
  else if (t === "body") updateBody();
  else if (t === "nutrition") updateNutrition();
  else window.HGWorkout?.update();
}
function showTab(t) {
  tab = t;
  try { localStorage.setItem(TABKEY, t); } catch {}
  TABS.forEach(id => { $("panel-" + id).hidden = id !== t; $("tab-" + id).setAttribute("aria-selected", String(id === t)); });
  $("tabs").style.setProperty("--i", TABS.indexOf(t));
  $("datebar").hidden = t === "habits";
  drawDateBar();
  build(t);
}
$("tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });

function drawDateBar() {
  $("dlabel").textContent = parse(logDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  $("dnext").disabled = logDate >= fmt(new Date());
}
function moveDate(n) { logDate = n === 0 ? fmt(new Date()) : addDays(logDate, n); drawDateBar(); build(); }
$("dprev").onclick = () => moveDate(-1);
$("dnext").onclick = () => { if (logDate < fmt(new Date())) moveDate(1); };
$("dtoday").onclick = () => moveDate(0);

/* ---------- Shared UI helpers ---------- */
function field(id) {
  const m = METRIC[id], v = mval(id, logDate);
  return '<div class="metric" data-m="' + id + '"><label for="m-' + id + '">' + m.label + '</label><div class="field"><input id="m-' + id +
    '" data-metric="' + id + '" type="number" inputmode="decimal" step="' + m.step + '" min="0" value="' + (v === null ? "" : v) +
    '"><span class="unit">' + m.unit + "</span></div></div>";
}
function sfield(key, label, unit, step = "1", wide = false) {
  const v = data.settings[key];
  return '<div class="metric' + (wide ? " wide" : "") + '"><label for="s-' + key + '">' + label + '</label><div class="field"><input id="s-' + key +
    '" data-setting="' + key + '" type="number" inputmode="decimal" step="' + step + '" min="0" placeholder="' + (DEFAULTS[key] ?? "") +
    '" value="' + (v ?? "") + '"><span class="unit">' + unit + "</span></div></div>";
}
function tile(value, label, sub, ok) {
  return '<div class="tile' + (ok ? " ok" : "") + '"><b>' + value + "</b><small>" + label + '</small><span class="delta">' + sub + "</span></div>";
}
function progress(label, v, target, kind, unit) {
  const max = kind === "range" ? S("calMax") : target;
  const pct = v === null ? 0 : Math.min(1, v / max);
  let cls = "", note = "";
  if (v === null) note = "Not logged";
  else if (kind === "range") {
    cls = v > S("calMax") ? "over" : v >= S("calMin") ? "ok" : "";
    note = v > S("calMax") ? num(v - S("calMax")) + " over" : v >= S("calMin") ? "In range" : num(S("calMin") - v) + " to minimum";
  } else { cls = v >= target ? "ok" : ""; note = v >= target ? "Target met" : num(target - v) + " " + unit + " to go"; }
  return '<div class="prog"><small><b>' + label + "</b> · " + (v === null ? "—" : num(v) + " " + unit) + " · " + note +
    '</small><div class="pbar ' + cls + '"><i style="transform:scaleX(' + pct.toFixed(3) + ')"></i></div></div>';
}
function spark(metric, span, label) {
  const pts = lastValues(metric, logDate, span);
  if (pts.length < 2) return "";
  const W = 300, H = 70, P = 6;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), range = hi - lo || 1;
  const t0 = parse(pts[0].d).getTime(), tr = (parse(pts[pts.length - 1].d).getTime() - t0) || 1;
  const xy = p => [P + (parse(p.d).getTime() - t0) / tr * (W - 2 * P), H - P - (p.v - lo) / range * (H - 2 * P)];
  const path = pts.map((p, i) => (i ? "L" : "M") + xy(p).map(n => n.toFixed(1)).join(" ")).join("");
  const [lx, ly] = xy(pts[pts.length - 1]);
  return '<div class="spark"><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + '"><path d="' + path +
    '" vector-effect="non-scaling-stroke"/><circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="3.5"/></svg><small>' + esc(label) + ": " + num(lo, 1) + "–" + num(hi, 1) + "</small></div>";
}

/* ---------- Habits tab ---------- */
function drawGrid() {
  const days = new Date(year, month + 1, 0).getDate();
  $("month").textContent = new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  let html = '<thead><tr><th class="name">HABIT</th>';
  for (let d = 1; d <= days; d++) html += "<th>" + d + "</th>";
  html += '<th class="total">TOTAL</th></tr></thead><tbody>';
  let done = 0;
  for (const habit of data.habits) {
    let count = 0;
    html += '<tr><th class="name"><button class="habitbtn" data-edit="' + esc(habit.id) + '">' + esc(habit.name) + (data.links[habit.id] ? " ⚡" : "") + "</button></th>";
    for (let d = 1; d <= days; d++) {
      const checked = !!data.checks[habit.id + "|" + gridDate(d)];
      if (checked) count++;
      html += '<td><button class="tick ' + (checked ? "on" : "") + '" aria-pressed="' + checked + '" aria-label="' + esc(habit.name) + " " + gridDate(d) +
        '" data-id="' + esc(habit.id) + '" data-day="' + d + '">' + (checked ? "✓" : "") + "</button></td>";
    }
    done += count;
    html += '<td class="total">' + count + "</td></tr>";
  }
  html += "</tbody>";
  if (!data.habits.length) html = '<tr><td class="empty">Add your first habit using + Habit.</td></tr>';
  $("grid").innerHTML = html;
  $("done").textContent = done;
  $("rate").textContent = (data.habits.length ? Math.round(100 * done / (days * data.habits.length)) : 0) + "%";
  $("addplan").hidden = planItems().every(p => hasHabit(p.id));
}
$("grid").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.edit) { edit(b.dataset.edit); return; }
  if (!b.dataset.day) return;
  const k = b.dataset.id + "|" + gridDate(Number(b.dataset.day));
  data.checks[k] = !data.checks[k];
  save();
  const x = $("scroll").scrollLeft;
  drawGrid();
  $("scroll").scrollLeft = x;
});
$("addplan").onclick = () => {
  for (const p of planItems()) {
    if (hasHabit(p.id)) continue;
    data.habits.push({ id: p.id, name: p.name });
    if (p.link) { data.links[p.id] = { ...p.link }; applyAllDates(p.id); }
  }
  save();
  drawGrid();
};

/* ---------- Body tab ---------- */
function buildBody() {
  const h = S("heightIn"), ft = h ? Math.floor(h / 12) : "", inch = h ? Math.round((h % 12) * 10) / 10 : "";
  $("panel-body").innerHTML =
    '<section class="card"><div class="gridtitle"><b>Height & goals</b><small>Set once</small></div><div class="metrics">' +
    '<div class="metric"><label for="h-ft">Height</label><div class="field"><input id="h-ft" data-height="ft" type="number" inputmode="numeric" min="0" max="8" value="' + ft + '"><span class="unit">ft</span></div></div>' +
    '<div class="metric"><label for="h-in">&nbsp;</label><div class="field"><input id="h-in" data-height="in" type="number" inputmode="decimal" step="0.5" min="0" max="11.5" value="' + inch + '"><span class="unit">in</span></div></div>' +
    sfield("goalWeight", "Goal weight", "lb", "0.1") + sfield("waistGoal", "Waist goal", "in", "0.1") + "</div></section>" +
    '<section class="card"><div class="gridtitle"><b>Body log</b><small>Saved per day</small></div><div class="metrics">' + field("weight") + field("waist") + field("sleep") +
    '</div><div class="hint">Waist: measure at navel level every couple of weeks. Weigh at the same time of day.</div></section>' +
    '<section class="card"><div class="gridtitle"><b>Body trends</b><small id="bodyrange"></small></div><div class="trends" id="bodytiles"></div><div id="bodyspark"></div><div class="hint" id="bmihint"></div></section>';
  updateBody();
}
function updateBody() {
  if (!$("bodytiles")) return;
  const h = S("heightIn"), w = latest("weight", logDate), wl = lastValues("weight", logDate, 28);
  const delta = wl.length > 1 ? wl[wl.length - 1].v - wl[0].v : null;
  const bmi = h && w ? 703 * w.v / (h * h) : null;
  const goal = S("goalWeight"), waist = latest("waist", logDate, 120), sleep = window7("sleep", logDate);
  $("bodyrange").textContent = "Latest as of " + short(logDate);
  const toGo = goal && w ? w.v - goal : null;
  $("bodytiles").innerHTML =
    tile(w ? num(w.v, 1) + " lb" : "—", "Weight (latest)", delta === null ? "Log 2+ weigh-ins" : (delta > 0 ? "+" : "") + num(delta, 1) + " lb / 28 days", delta !== null && delta < 0) +
    tile(bmi ? num(bmi, 1) : "—", "BMI", h ? "From latest weight" : "Add height above", false) +
    tile(goal ? (toGo === null ? "—" : (toGo <= 0 ? "Reached" : num(toGo, 1) + " lb")) : "—", "To goal weight", goal ? "Goal " + num(goal, 1) + " lb" : "Set a goal above", !!goal && toGo !== null && toGo <= 0) +
    tile(waist ? num(waist.v, 1) + " in" : "—", "Waist (latest)", "Goal under " + S("waistGoal") + " in", !!waist && waist.v < S("waistGoal")) +
    tile(num(avg(sleep), 1) + (sleep.length ? " h" : ""), "Avg sleep (7d)", sleep.length + " of 7 nights · target " + S("sleepMin") + "h+", avg(sleep) !== null && avg(sleep) >= S("sleepMin"));
  $("bodyspark").innerHTML = spark("weight", 60, "Weight, last 60 days (lb)") + spark("waist", 120, "Waist, last 120 days (in)");
  $("bmihint").textContent = h ? "Healthy-BMI weight range for your height: " + num(18.5 * h * h / 703) + "–" + num(24.9 * h * h / 703) +
    " lb. BMI ignores muscle mass, so use waist and trends too." : "";
}

/* ---------- Nutrition tab ---------- */
function buildNutrition() {
  $("panel-nutrition").innerHTML =
    '<section class="card"><div class="gridtitle"><b>Intake</b><small>Saved per day</small></div><div class="metrics">' + field("calories") + field("protein") + field("fiber") +
    '</div><div id="nutbars"></div></section>' +
    '<section class="card"><div class="gridtitle"><b>7-day averages</b><small id="nutrange"></small></div><div class="trends" id="nuttiles"></div></section>' +
    '<section class="card"><div class="gridtitle"><b>Daily targets</b><small>Editable</small></div><div class="metrics">' +
    sfield("calMin", "Calories min", "kcal") + sfield("calMax", "Calories max", "kcal") + sfield("proteinMin", "Protein min", "g") + sfield("fiberMin", "Fiber min", "g") +
    '</div><div class="hint">Changing a target also updates the matching ⚡ habits on the Habits tab. Discuss targets with your doctor.</div></section>';
  updateNutrition();
}
function updateNutrition() {
  if (!$("nutbars")) return;
  const cal = mval("calories", logDate), pro = mval("protein", logDate), fib = mval("fiber", logDate);
  $("nutbars").innerHTML = progress("Calories", cal, S("calMax"), "range", "kcal") + progress("Protein", pro, S("proteinMin"), "min", "g") + progress("Fiber", fib, S("fiberMin"), "min", "g");
  const c = window7("calories", logDate), p = window7("protein", logDate), f = window7("fiber", logDate);
  const hit = (a, fn) => a.filter(fn).length;
  $("nutrange").textContent = short(addDays(logDate, -6)) + " – " + short(logDate);
  $("nuttiles").innerHTML =
    tile(num(avg(c)), "Avg calories", c.length + " of 7 days logged", avg(c) !== null && avg(c) >= S("calMin") && avg(c) <= S("calMax")) +
    tile(hit(c, v => v >= S("calMin") && v <= S("calMax")) + "/7", "Days in calorie range", "Target " + num(S("calMin")) + "–" + num(S("calMax")), false) +
    tile(num(avg(p)) + (p.length ? " g" : ""), "Avg protein", hit(p, v => v >= S("proteinMin")) + " days at " + S("proteinMin") + "g+", avg(p) !== null && avg(p) >= S("proteinMin")) +
    tile(num(avg(f)) + (f.length ? " g" : ""), "Avg fiber", hit(f, v => v >= S("fiberMin")) + " days at " + S("fiberMin") + "g+", avg(f) !== null && avg(f) >= S("fiberMin"));
  document.querySelectorAll("#panel-nutrition .metric[data-m]").forEach(el => {
    const id = el.dataset.m, v = mval(id, logDate);
    let ok = false;
    if (v !== null) ok = id === "calories" ? v >= S("calMin") && v <= S("calMax") : id === "protein" ? v >= S("proteinMin") : id === "fiber" ? v >= S("fiberMin") : false;
    el.classList.toggle("ok", ok);
  });
}

/* ---------- Inputs (delegated, all tabs) ---------- */
document.addEventListener("change", e => {
  const m = e.target.closest?.("input[data-metric]");
  if (m) {
    const id = m.dataset.metric, key = id + "|" + logDate, raw = m.value.trim();
    const v = raw === "" ? NaN : Number(raw);
    if (isFinite(v) && v >= 0) data.metrics[key] = v; else delete data.metrics[key];
    applyMetricDate(id, logDate);
    save();
    update();
    return;
  }
  const s = e.target.closest?.("input[data-setting]");
  if (s) {
    const raw = s.value.trim(), v = raw === "" ? NaN : Number(raw);
    if (isFinite(v) && v >= 0) data.settings[s.dataset.setting] = v; else delete data.settings[s.dataset.setting];
    syncPlanLinks();
    save();
    update();
    return;
  }
  const hh = e.target.closest?.("input[data-height]");
  if (hh) {
    const ft = Number($("h-ft").value) || 0, inch = Number($("h-in").value) || 0, total = ft * 12 + inch;
    if (total > 0) data.settings.heightIn = total; else delete data.settings.heightIn;
    save();
    update();
  }
});

/* ---------- Habit editor ---------- */
$("lmetric").innerHTML += METRICS.filter(m => m.id !== "weight" && m.id !== "waist")
  .map(m => '<option value="' + m.id + '">' + m.label + (m.unit ? " (" + m.unit + ")" : "") + "</option>").join("");
$("lmetric").onchange = () => { $("lrange").hidden = !$("lmetric").value; };

function edit(id = null) {
  editing = id;
  const link = id ? data.links[id] : null;
  $("heading").textContent = id ? "Edit habit" : "Add habit";
  $("habit").value = data.habits.find(h => h.id === id)?.name || "";
  $("lmetric").value = link?.metric || "";
  $("lmin").value = link?.min ?? "";
  $("lmax").value = link?.max ?? "";
  $("lrange").hidden = !link;
  $("remove").hidden = !id;
  $("edit").showModal();
  $("habit").focus();
}
$("add").onclick = () => edit();
$("cancel").onclick = () => $("edit").close();
$("editor").onsubmit = e => {
  e.preventDefault();
  const name = $("habit").value.trim();
  if (!name) return;
  let hid = editing;
  if (editing) { const h = data.habits.find(h => h.id === editing); if (h) h.name = name; }
  else { hid = crypto.randomUUID?.() || "h" + Date.now(); data.habits.push({ id: hid, name }); }
  const metric = $("lmetric").value;
  const min = $("lmin").value === "" ? null : Number($("lmin").value);
  const max = $("lmax").value === "" ? null : Number($("lmax").value);
  if (metric && (min !== null || max !== null)) {
    data.links[hid] = { metric, ...(min !== null && { min }), ...(max !== null && { max }) };
    applyAllDates(hid);
  } else delete data.links[hid];
  save();
  $("edit").close();
  drawGrid();
};
$("remove").onclick = () => {
  if (!editing || !confirm("Delete this habit and its history?")) return;
  data.habits = data.habits.filter(h => h.id !== editing);
  delete data.links[editing];
  Object.keys(data.checks).filter(k => k.startsWith(editing + "|")).forEach(k => delete data.checks[k]);
  save();
  $("edit").close();
  drawGrid();
};

/* ---------- Month nav ---------- */
function move(n) {
  const d = new Date(year, month + n, 1);
  year = d.getFullYear(); month = d.getMonth();
  drawGrid();
  $("scroll").scrollLeft = 0;
}
$("previous").onclick = () => move(-1);
$("next").onclick = () => move(1);
$("today").onclick = () => {
  const d = new Date();
  year = d.getFullYear(); month = d.getMonth();
  drawGrid();
  $("scroll").scrollLeft = 0;
};

/* ---------- Public hooks ---------- */
window.HG = {
  $, esc, num, avg, fmt, parse, addDays, short, S, DEFAULTS, save, mval, lastValues, window7, latest, field, tile, progress, spark, applyMetricDate,
  get data() { return data; },
  get logDate() { return logDate; },
  get tab() { return tab; }
};

// Called by sync.js after merging remote data.
window.HabitGridApply = next => {
  data = normalize(next);
  migrate();
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  drawGrid();
  const typing = document.activeElement?.matches?.("input,textarea,select");
  if (tab !== "habits") (typing ? update() : build());
};

showTab(tab);
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
