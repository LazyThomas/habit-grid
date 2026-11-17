(() => {
"use strict";
const KEY = "habitgrid.v1";
const $ = id => document.getElementById(id);

/* ---------- Health model ---------- */
const METRICS = [
  { id: "weight",   label: "Weight",        unit: "lb",   step: "0.1", hint: "Trend down" },
  { id: "waist",    label: "Waist",         unit: "in",   step: "0.1", hint: "Goal under 40" },
  { id: "calories", label: "Calories",      unit: "kcal", step: "1",   hint: "2,150–2,400" },
  { id: "protein",  label: "Protein",       unit: "g",    step: "1",   hint: "140–180" },
  { id: "fiber",    label: "Fiber",         unit: "g",    step: "1",   hint: "25–35" },
  { id: "walk",     label: "Walk / cardio", unit: "min",  step: "1",   hint: "150+ per week" },
  { id: "sleep",    label: "Sleep",         unit: "h",    step: "0.1", hint: "7–8" }
];
const METRIC = Object.fromEntries(METRICS.map(m => [m.id, m]));

// Deterministic ids so two devices adding the plan never create duplicates.
const PLAN = [
  { id: "hp-calories", name: "Calories 2,150–2,400", link: { metric: "calories", min: 2150, max: 2400 } },
  { id: "hp-protein",  name: "Protein 140g+",        link: { metric: "protein",  min: 140 } },
  { id: "hp-fiber",    name: "Fiber 25g+",           link: { metric: "fiber",    min: 25 } },
  { id: "hp-walk",     name: "Walk 20+ min",         link: { metric: "walk",     min: 20 } },
  { id: "hp-sleep",    name: "Sleep 7h+",            link: { metric: "sleep",    min: 7 } },
  { id: "hp-lift",     name: "Lift weights (2–3x/wk)" },
  { id: "hp-liquid",   name: "No liquid calories" },
  { id: "hp-alcohol",  name: "No alcohol" }
];

const initial = () => ({
  habits: [
    { id: "h1", name: "Morning workout" }, { id: "h2", name: "Read" },
    { id: "h3", name: "Study" }, { id: "h4", name: "Drink water" }
  ],
  checks: {}, metrics: {}, links: {}
});

function normalize(d) {
  d.metrics ||= {};
  d.links ||= {};
  return d;
}

let data;
try {
  const stored = JSON.parse(localStorage.getItem(KEY));
  data = stored && Array.isArray(stored.habits) && stored.checks ? stored : initial();
} catch { data = initial(); }
normalize(data);

const now = new Date();
let year = now.getFullYear(), month = now.getMonth(), editing = null;

/* ---------- Date helpers ---------- */
const pad = n => String(n).padStart(2, "0");
const fmt = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const gridDate = day => year + "-" + pad(month + 1) + "-" + pad(day);
let logDate = fmt(now);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

// If a habit is linked to a metric and that metric was logged for the date,
// the checkmark follows the numbers. No number logged → checkmark stays manual.
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

/* ---------- Monthly grid ---------- */
function drawGrid() {
  const days = new Date(year, month + 1, 0).getDate();
  $("month").textContent = new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  let html = '<thead><tr><th class="name">HABIT</th>';
  for (let d = 1; d <= days; d++) html += "<th>" + d + "</th>";
  html += '<th class="total">TOTAL</th></tr></thead><tbody>';
  let done = 0;
  for (const habit of data.habits) {
    let count = 0;
    const auto = data.links[habit.id] ? " ⚡" : "";
    html += '<tr><th class="name"><button class="habitbtn" data-edit="' + esc(habit.id) + '">' + esc(habit.name) + auto + "</button></th>";
    for (let d = 1; d <= days; d++) {
      const checked = !!data.checks[habit.id + "|" + gridDate(d)];
      if (checked) count++;
      html += '<td><button class="tick ' + (checked ? "on" : "") + '" aria-pressed="' + checked +
        '" aria-label="' + esc(habit.name) + " " + gridDate(d) + '" data-id="' + esc(habit.id) +
        '" data-day="' + d + '">' + (checked ? "✓" : "") + "</button></td>";
    }
    done += count;
    html += '<td class="total">' + count + "</td></tr>";
  }
  html += "</tbody>";
  if (!data.habits.length) html = '<tr><td class="empty">Add your first habit using + Habit.</td></tr>';
  $("grid").innerHTML = html;
  $("done").textContent = done;
  $("rate").textContent = (data.habits.length ? Math.round(100 * done / (days * data.habits.length)) : 0) + "%";
}

/* ---------- Health log ---------- */
function drawLogHeader() {
  $("logdate").textContent = parse(logDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  $("lognext").disabled = logDate >= fmt(new Date());
}

function drawMetricInputs() {
  $("metrics").innerHTML = METRICS.map(m => {
    const v = mval(m.id, logDate);
    return '<div class="metric" data-m="' + m.id + '"><label for="m-' + m.id + '">' + m.label +
      "<small>" + m.hint + '</small></label><div class="field"><input id="m-' + m.id +
      '" data-metric="' + m.id + '" type="number" inputmode="decimal" step="' + m.step + '" min="0" value="' +
      (v === null ? "" : v) + '"><span class="unit">' + m.unit + "</span></div></div>";
  }).join("");
  updateOkStates();
}

function updateOkStates() {
  const rules = {};
  for (const h of data.habits) { const l = data.links[h.id]; if (l && !rules[l.metric]) rules[l.metric] = l; }
  document.querySelectorAll(".metric").forEach(el => {
    const id = el.dataset.m, v = mval(id, logDate);
    el.classList.toggle("ok", v !== null && !!rules[id] && meets(rules[id], v));
  });
}

function drawPlanButton() {
  const missing = PLAN.some(p => !data.habits.some(h => h.id === p.id));
  $("addplan").hidden = !missing;
}

/* ---------- Trends ---------- */
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const num = (v, d = 0) => v === null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: d });

function window7(metric, end) {
  const out = [];
  for (let i = 0; i < 7; i++) { const v = mval(metric, addDays(end, -i)); if (v !== null) out.push(v); }
  return out;
}

function lastValues(metric, end, span) {
  const out = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = addDays(end, -i), v = mval(metric, d);
    if (v !== null) out.push({ d, v });
  }
  return out;
}

function drawTrends() {
  $("range").textContent = parse(addDays(logDate, -6)).toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " – " + parse(logDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const cal = window7("calories", logDate), pro = window7("protein", logDate);
  const walk = window7("walk", logDate), sleep = window7("sleep", logDate);
  const calAvg = avg(cal), proAvg = avg(pro), sleepAvg = avg(sleep);
  const walkSum = walk.reduce((a, b) => a + b, 0);
  const w = lastValues("weight", logDate, 28), waist = lastValues("waist", logDate, 60);
  const wLatest = w.length ? w[w.length - 1].v : null;
  const wDelta = w.length > 1 ? wLatest - w[0].v : null;
  const waistLatest = waist.length ? waist[waist.length - 1].v : null;
  const tile = (value, label, sub, ok) => '<div class="tile' + (ok ? " ok" : "") + '"><b>' + value + "</b><small>" + label +
    '</small><span class="delta">' + sub + "</span></div>";
  $("trends").innerHTML =
    tile(num(wLatest, 1) + (wLatest === null ? "" : " lb"), "Weight (latest)",
      wDelta === null ? "Log 2+ weigh-ins" : (wDelta > 0 ? "+" : "") + num(wDelta, 1) + " lb / 28 days", wDelta !== null && wDelta < 0) +
    tile(num(waistLatest, 1) + (waistLatest === null ? "" : " in"), "Waist (latest)", "Goal under 40 in", waistLatest !== null && waistLatest < 40) +
    tile(num(calAvg), "Avg calories", cal.length + " of 7 days · target 2,150–2,400", calAvg !== null && calAvg >= 2150 && calAvg <= 2400) +
    tile(num(proAvg) + (proAvg === null ? "" : " g"), "Avg protein", pro.length + " of 7 days · target 140+", proAvg !== null && proAvg >= 140) +
    tile(num(walkSum) + " min", "Walk / cardio", "target 150+ per week", walkSum >= 150) +
    tile(num(sleepAvg, 1) + (sleepAvg === null ? "" : " h"), "Avg sleep", sleep.length + " of 7 days · target 7+", sleepAvg !== null && sleepAvg >= 7);

  // Weight sparkline (last 60 days)
  const pts = lastValues("weight", logDate, 60);
  if (pts.length < 2) { $("spark").innerHTML = ""; return; }
  const W = 300, H = 70, P = 6;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const t0 = parse(pts[0].d).getTime(), t1 = parse(pts[pts.length - 1].d).getTime() || 1, tr = (t1 - t0) || 1;
  const xy = p => [P + (parse(p.d).getTime() - t0) / tr * (W - 2 * P), H - P - (p.v - lo) / span * (H - 2 * P)];
  const path = pts.map((p, i) => (i ? "L" : "M") + xy(p).map(n => n.toFixed(1)).join(" ")).join("");
  const [lx, ly] = xy(pts[pts.length - 1]);
  $("spark").innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="Weight trend"><path d="' + path +
    '" vector-effect="non-scaling-stroke"/><circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="3.5"/></svg><small>Weight, last 60 days: ' +
    num(lo, 1) + "–" + num(hi, 1) + " lb</small>";
}

function drawAll() { drawGrid(); drawLogHeader(); drawTrends(); drawPlanButton(); updateOkStates(); }

/* ---------- Grid interactions ---------- */
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

/* ---------- Health log interactions ---------- */
$("metrics").addEventListener("change", e => {
  const input = e.target.closest("input[data-metric]");
  if (!input) return;
  const id = input.dataset.metric, key = id + "|" + logDate, raw = input.value.trim();
  const v = raw === "" ? NaN : Number(raw);
  if (isFinite(v) && v >= 0) data.metrics[key] = v; else delete data.metrics[key];
  applyMetricDate(id, logDate);
  save();
  drawGrid(); drawTrends(); updateOkStates();
});
function moveLog(n) { logDate = addDays(logDate, n); drawLogHeader(); drawMetricInputs(); drawTrends(); }
$("logprev").onclick = () => moveLog(-1);
$("lognext").onclick = () => { if (logDate < fmt(new Date())) moveLog(1); };
$("logtoday").onclick = () => { logDate = fmt(new Date()); drawLogHeader(); drawMetricInputs(); drawTrends(); };

$("addplan").onclick = () => {
  for (const p of PLAN) {
    if (data.habits.some(h => h.id === p.id)) continue;
    data.habits.push({ id: p.id, name: p.name });
    if (p.link) { data.links[p.id] = { ...p.link }; applyAllDates(p.id); }
  }
  save();
  drawAll();
};

/* ---------- Habit editor ---------- */
$("lmetric").innerHTML += METRICS.filter(m => m.id !== "weight" && m.id !== "waist")
  .map(m => '<option value="' + m.id + '">' + m.label + " (" + m.unit + ")</option>").join("");
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
  if (editing) {
    const h = data.habits.find(h => h.id === editing);
    if (h) h.name = name;
  } else {
    hid = crypto.randomUUID?.() || "h" + Date.now();
    data.habits.push({ id: hid, name });
  }
  const metric = $("lmetric").value;
  const min = $("lmin").value === "" ? null : Number($("lmin").value);
  const max = $("lmax").value === "" ? null : Number($("lmax").value);
  if (metric && (min !== null || max !== null)) {
    data.links[hid] = { metric, ...(min !== null && { min }), ...(max !== null && { max }) };
    applyAllDates(hid);
  } else delete data.links[hid];
  save();
  $("edit").close();
  drawAll();
};
$("remove").onclick = () => {
  if (!editing || !confirm("Delete this habit and its history?")) return;
  data.habits = data.habits.filter(h => h.id !== editing);
  delete data.links[editing];
  Object.keys(data.checks).filter(k => k.startsWith(editing + "|")).forEach(k => delete data.checks[k]);
  save();
  $("edit").close();
  drawAll();
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

/* ---------- Sync hook (called by sync.js after merging remote data) ---------- */
window.HabitGridApply = next => {
  data = normalize(next);
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
  drawAll();
  if (!document.activeElement?.matches?.("input[data-metric]")) drawMetricInputs();
};

drawAll();
drawMetricInputs();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
