/* Atlas Life — Presentation App (no build step)
   - PowerPoint-like slides with keyboard nav & builds
   - Persistent right panel with live pricing & final plan recommender
   - Works offline; loads JSON with embedded fallbacks
*/
"use strict";

/* ====== Config ====== */
const VERSION = "ppt-v1.0.0";

// Modal factors assume ANNUAL base premium -> modal amount.
const MODAL_FACTORS = { Annual: 1.00, Semiannual: 0.52, Quarterly: 0.27, Monthly: 0.09 };

// Dropdown data
const STATE_OPTIONS = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];
const POLICY_TYPES = ["Term","Whole","UL","IUL","GUL","Final Expense"];
const TERM_OPTIONS = [10,15,20,25,30];

// Policy fee by state (monthly equivalent)
const STATE_POLICY_FEE = (st) => ({ FL:8, NY:7, CA:7, MI:6 }[st] ?? 6);

// Rider pricing (monthly equivalent; applied on pre-fee premium)
const RIDERS = {
  ADB_per_1k: 0.02,    // per $1,000 DB per month
  Waiver_pct: 0.05,    // of pre-fee premium
  Child_flat: 5.00,    // $/mo
  LTC_pct: 0.08,       // of pre-fee premium
  LTC_min: 10.00       // $/mo minimum
};

// Simple product factor tuning
function productFactor(policyType){
  return ({ Term:1.00, Whole:1.25, UL:1.15, IUL:1.20, GUL:1.10, "Final Expense":1.30 }[policyType] ?? 1.00);
}

// Underwriting table multipliers
const TABLE_MULT = { A:1.25, B:1.50, C:1.75, D:2.00 };

/* ====== State ====== */
const state = {
  company: null,
  conditions: null,
  objections: null,
  selectedConditions: new Set(),
  bulletsProgress: new Map(), // slide -> visible count
  lastCalc: null
};

/* ====== Utilities ====== */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const money = (n, c=true) => (isFinite(n)? n:0).toLocaleString(undefined,{style:"currency",currency:"USD", maximumFractionDigits: c?2:0});
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function parseN(v){ const n = parseFloat(v); return isFinite(n)? n:0; }

function populateSelect(el, options, def){
  if (!el) return;
  el.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join("");
  if (def != null) el.value = String(def);
}

async function loadJSON(path, fallbackId){
  try{
    const res = await fetch(path, {cache:"no-store"});
    if (!res.ok) throw new Error("fetch failed");
    return await res.json();
  }catch{
    const el = document.getElementById(fallbackId);
    return JSON.parse(el.textContent);
  }
}

function bmiFromInLb(inches, pounds){
  if (!inches || !pounds) return 0;
  return (pounds / (inches*inches)) * 703;
}
function bmiBand(bmi){
  if (!bmi) return {drop:0, mult:1.00, note:"—"};
  if (bmi < 18.5) return {drop:0, mult:1.03, note:"Underweight"};
  if (bmi < 25) return {drop:0, mult:1.00, note:"Healthy"};
  if (bmi < 30) return {drop:0, mult:1.05, note:"Overweight"};
  if (bmi < 35) return {drop:1, mult:1.10, note:"Obesity I"};
  if (bmi < 40) return {drop:2, mult:1.20, note:"Obesity II"};
  return {drop:3, mult:1.35, note:"Obesity III"};
}

/* ====== Pricing Helpers (Required signatures) ====== */
// Base rate per $1,000 *ANNUAL* (so modal factors convert to billed amounts)
function baseRatePer1k(age, sex, policyType){
  const sexAdj = (sex === "F") ? 0.95 : 1.00;
  switch(policyType){
    case "Term":
      // Use 20-yr curve as reference; term-specific factor applied separately
      return Math.max(0.36, (0.72 + 0.024*(age-30))) * sexAdj; // 12× monthly example (0.06 -> 0.72)
    case "Whole":
      return Math.max(0.72, (1.20 + 0.048*(age-30))) * sexAdj; // 12× (0.10 -> 1.20)
    case "UL":
      return Math.max(0.66, (1.08 + 0.042*(age-30))) * sexAdj;
    case "IUL":
      return Math.max(0.72, (1.14 + 0.042*(age-30))) * sexAdj;
    case "GUL":
      return Math.max(0.60, (1.02 + 0.036*(age-30))) * sexAdj;
    case "Final Expense":
      if (age < 50) return 1.20 * sexAdj;  // 12×0.10
      if (age < 60) return 1.68 * sexAdj;  // 12×0.14
      if (age < 70) return 2.64 * sexAdj;  // 12×0.22
      if (age < 80) return 4.56 * sexAdj;  // 12×0.38
      return 6.24 * sexAdj;               // 12×0.52
    default:
      return 1.20;
  }
}
function ageFactor(age){ return 1 + Math.max(0, (age - 30)) * 0.01; }
function smokerFactor(policyType, smoker){ return (smoker === "Y") ? (policyType==="Term" ? 1.8 : 1.6) : 1.0; }
function conditionsMultiplier(selectedConditions){
  return selectedConditions.reduce((acc,c)=> acc * (c.multiplier || 1.00), 1.00);
}
function riderCost(riders, deathBenefit, basePremium){
  // riders expressed in monthly; convert to ANNUAL to sum with annual base
  const includes = new Set(riders || []);
  let monthly = 0;
  if (includes.has("ADB")) monthly += (deathBenefit/1000) * RIDERS.ADB_per_1k;
  if (includes.has("Waiver")) monthly += basePremium * RIDERS.Waiver_pct / 12;
  if (includes.has("Child")) monthly += RIDERS.Child_flat;
  if (includes.has("LTC")) monthly += Math.max(RIDERS.LTC_min, basePremium * RIDERS.LTC_pct / 12);
  return monthly * 12; // return ANNUAL rider cost
}

// Determine UW class from conditions + BMI; apply table rating if heavy
function determineUWClass(selectedConditions, bmiInfo){
  let drops = 0, red = false;
  selectedConditions.forEach(c => { drops += (c.class_drop || 0); if (c.exclude) red = true; });
  drops += (bmiInfo.drop || 0);

  if (red || drops >= 3){
    const steps = Math.max(1, drops - 2);
    const table = ["A","B","C","D"][Math.min(steps-1,3)];
    return { label: `Substandard (Table ${table})`, table, multiplier: TABLE_MULT[table] };
  }
  const classes = ["Preferred+","Preferred","Standard"];
  const idx = Math.min(drops, 2);
  return { label: classes[idx], table: null, multiplier: 1.00 };
}

/* Core premium (ANNUAL base, then modal) */
function computePremium(inputs){
  const { deathBenefit, age, sex, policyType, smoker, conditions, riders, policyFee, modalFactor, term } = inputs;

  const termFactor = (policyType==="Term") ? (1 + Math.max(0, (parseInt(term||"20",10) - 20)) * 0.01) : 1.00;

  const basePer1k = baseRatePer1k(age, sex, policyType) * termFactor;
  const base = (deathBenefit / 1000) * basePer1k; // ANNUAL

  const bmi = bmiFromInLb(inputs.heightIn, inputs.weightLb);
  const bmiInfo = bmiBand(bmi);
  const uw = determineUWClass(conditions, bmiInfo);

  let annual = base
    * ageFactor(age)
    * smokerFactor(policyType, smoker)
    * productFactor(policyType)
    * conditionsMultiplier(conditions)
    * uw.multiplier;

  annual += riderCost(riders, deathBenefit, annual);
  annual += (policyFee * 12);

  const billed = annual * modalFactor;

  return {
    annual, billed, basePer1k, uw, bmiInfo,
    factors: {
      age: ageFactor(age),
      smoker: smokerFactor(policyType, smoker),
      product: productFactor(policyType),
      conditions: conditionsMultiplier(conditions),
      term: termFactor
    }
  };
}

/* Solve DB from target billed premium (target given in modal units) */
function solveDeathBenefit(targetPremium, inputs){
  const maxDB = 5_000_000, minDB = 1_000;
  let lo = minDB, hi = maxDB, ans = minDB;
  for (let i=0; i<40; i++){
    const mid = (lo + hi) / 2;
    const res = computePremium({ ...inputs, deathBenefit: mid });
    if (res.billed > targetPremium){
      hi = mid;
    } else {
      ans = mid; lo = mid;
    }
  }
  return Math.round(ans/1000)*1000;
}

/* ====== Slides Controller ====== */
const Slides = {
  idx: 0,
  total: 0,
  init(){
    this.slides = $$(".slide");
    this.total = this.slides.length;
    this.show(0);

    $("#prevBtn").addEventListener("click", ()=>this.prev());
    $("#nextBtn").addEventListener("click", ()=>this.next());
    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); this.next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); this.prev(); }
      else if (e.key === "Home") { e.preventDefault(); this.show(0,true); }
      else if (e.key === "End") { e.preventDefault(); this.show(this.total-1,true); }
    });
  },
  show(n, allVisible=false){
    this.idx = clamp(n, 0, this.total-1);
    this.slides.forEach((s,i)=>{
      s.classList.toggle("is-active", i===this.idx);
      if (i===this.idx){
        // reset builds
        const builds = $$(".build", s);
        builds.forEach(b => b.classList.toggle("visible", allVisible));
        state.bulletsProgress.set(i, allVisible ? builds.length : 0);
      }
    });
    $("#slideCounter").textContent = `${this.idx+1} / ${this.total}`;
    $("#progressBar").style.width = `${((this.idx+1)/this.total)*100}%`;
  },
  next(){
    const s = this.slides[this.idx];
    const builds = $$(".build", s);
    const shown = state.bulletsProgress.get(this.idx) || 0;
    if (shown < builds.length){
      builds[shown].classList.add("visible");
      state.bulletsProgress.set(this.idx, shown+1);
      return;
    }
    this.show(this.idx+1);
  },
  prev(){ this.show(this.idx-1); }
};

/* ====== UI Wiring ====== */
function buildConditionsUI(){
  const host = $("#condGroups");
  host.innerHTML = "";
  const cats = state.conditions.categories;
  const map = state.conditions.items.reduce((acc,i)=> (acc[i.category]??=[]).push(i), {});
  cats.forEach(cat => {
    const group = document.createElement("div");
    group.className = "cond-group";
    group.innerHTML = `<h5>${cat.label}</h5>`;
    (map[cat.id] || []).forEach(item => {
      const id = `cond_${item.id}`;
      const row = document.createElement("label");
      row.innerHTML = `<input type="checkbox" id="${id}" data-id="${item.id}"> <span>${item.label}</span>` + (item.exclude ? ` <span class="muted">(refer)</span>`:"");
      if (item.tooltip) row.title = item.tooltip;
      const cb = row.querySelector("input");
      cb.addEventListener("change", (e)=>{
        if (e.target.checked) state.selectedConditions.add(item.id);
        else state.selectedConditions.delete(item.id);
        recompute();
      });
      group.appendChild(row);
    });
    host.appendChild(group);
  });
}

function syncGoalToggle(){
  const isTP = document.querySelector("input[name=goal]:checked").value === "TP";
  $("#tpField").hidden = !isTP;
  $("#dbField").hidden = isTP;
}

function gatherInputs(){
  const age = clamp(parseN($("#age").value), 18, 120);
  const sex = $("#sex").value;
  const stateCode = $("#state").value;
  const smoker = $("#smoker").value;
  const policyType = $("#policyType").value;
  const term = $("#term").value;
  const goal = document.querySelector("input[name=goal]:checked").value;
  const deathBenefit = parseN($("#deathBenefit").value);
  const targetPremium = parseN($("#targetPremium").value);
  const heightIn = parseN($("#heightIn").value);
  const weightLb = parseN($("#weightLb").value);
  const modalSel = document.querySelector("input[name=mode]:checked")?.value || "Monthly";

  const riders = $$("fieldset.riders input:checked").map(cb=>cb.value);
  const selected = Array.from(state.selectedConditions).map(id => state.conditions.items.find(i=>i.id===id));

  const modalFactor = MODAL_FACTORS[modalSel];
  const policyFee = STATE_POLICY_FEE(stateCode);

  return { age, sex, stateCode, smoker, policyType, term, goal, deathBenefit, targetPremium, riders, selectedConditions:selected, modalSel, modalFactor, policyFee, heightIn, weightLb };
}

function recompute(){
  const inputs = gatherInputs();

  // Rider availability by product/state (simple example: NY no LTC)
  const disabledLTC = (inputs.stateCode === "NY");
  const ltcBox = $$("fieldset.riders input").find(cb => cb.value==="LTC");
  if (ltcBox){ ltcBox.disabled = disabledLTC; if (disabledLTC) ltcBox.checked = false; }

  let db = inputs.deathBenefit;
  if (inputs.goal === "TP" && inputs.targetPremium > 0){
    db = solveDeathBenefit(inputs.targetPremium, {
      age: inputs.age, sex: inputs.sex, policyType: inputs.policyType, smoker: inputs.smoker,
      conditions: inputs.selectedConditions, riders: inputs.riders, policyFee: inputs.policyFee, modalFactor: inputs.modalFactor,
      heightIn: inputs.heightIn, weightLb: inputs.weightLb, term: inputs.term
    });
    $("#deathBenefit").value = Math.max(1000, Math.round(db/1000)*1000);
  }

  const res = computePremium({
    deathBenefit: db, age: inputs.age, sex: inputs.sex, policyType: inputs.policyType, smoker: inputs.smoker,
    conditions: inputs.selectedConditions, riders: inputs.riders, policyFee: inputs.policyFee, modalFactor: inputs.modalFactor,
    heightIn: inputs.heightIn, weightLb: inputs.weightLb, term: inputs.term
  });
  state.lastCalc = { inputs, res, db };

  // Update live summary
  $("#uwClass").textContent = res.uw.label;
  $("#basePrem").textContent = money((db/1000)*res.basePer1k); // annual base
  $("#adjPrem").textContent = money(res.billed);
  $("#multis").textContent = `Age ${res.factors.age.toFixed(2)} · Smoker ${res.factors.smoker.toFixed(2)} · Product ${res.factors.product.toFixed(2)} · Cond ${res.factors.conditions.toFixed(2)}${inputs.policyType==="Term" ? ` · Term ${res.factors.term.toFixed(2)}`:""}`;

  // Update bound text on slides
  bind("brandName", state.company?.brand?.name);
  bind("brandTag", state.company?.brand?.tagline);
  bind("repName", state.company?.contact?.rep_name);
  bind("repPhone", state.company?.contact?.rep_phone);
  bind("repEmail", state.company?.contact?.rep_email);
  bind("aboutText", state.company?.about);

  // dynamic lists
  renderList("#diffList", (state.company?.differentiators||[]).map(t => `<li class="build">${t}</li>`));
  renderList("#claimsSteps", (state.company?.claims_steps||[]).map((t,i)=> `<li class="build" aria-setsize="${(state.company?.claims_steps||[]).length}" aria-posinset="${i+1}">${t}</li>`));
  renderPersonas();
  renderTestimonials();

  // Plans
  updatePlans();
}

function renderList(sel, items){
  const el = $(sel);
  if (!el) return;
  el.innerHTML = items.join("");
  // reset build state for current slide if visible
  const slide = el.closest(".slide");
  if (slide && slide.classList.contains("is-active")){
    state.bulletsProgress.set(Slides.idx, 0);
    $$(".build", slide).forEach(b=>b.classList.remove("visible"));
  }
}

function renderPersonas(){
  const grid = $("#personaGrid");
  const arr = state.company?.personas || [];
  grid.innerHTML = arr.map(p => `<div class="card build"><h3>${p.title}</h3><p class="muted">${p.desc}</p></div>`).join("");
}
function renderTestimonials(){
  const grid = $("#testimonials");
  const arr = state.company?.testimonials || [];
  grid.innerHTML = arr.map(t => `<div class="card build"><p>"${t.quote}"</p><p class="muted">— ${t.name}, ${t.role}</p></div>`).join("");
}

function updatePlans(){
  const { inputs, db } = state.lastCalc || {};
  if (!inputs) return;

  const baseRiders = inputs.riders || [];
  const mode = inputs.modalSel;

  const tiers = {
    bronze: { mult: 0.95, riders: [] },
    silver: { mult: 1.00, riders: baseRiders.length ? baseRiders : ["Waiver"] },
    gold:   { mult: 1.08, riders: Array.from(new Set([..."Waiver, LTC".split(", ").map(s=>s.trim()), ...baseRiders])) }
  };

  Object.entries(tiers).forEach(([name, t]) => {
    let tierDB = db, billed;
    if (inputs.goal === "TP") {
      const tp = inputs.targetPremium * t.mult;
      tierDB = solveDeathBenefit(tp, { ...inputs, riders: t.riders });
      billed = tp;
    } else {
      const r = computePremium({ ...inputs, deathBenefit: tierDB, riders: t.riders });
      billed = r.billed * t.mult;
    }
    const annual = billed / MODAL_FACTORS[mode];

    const bmi = bmiFromInLb(inputs.heightIn, inputs.weightLb);
    const uw = determineUWClass(inputs.selectedConditions, bmiBand(bmi));

    // SAFE DOM writes
    const priceEl = document.querySelector(`#${name}Price`);
    const dbEl    = document.querySelector(`#${name}DB`);
    const uwEl    = document.querySelector(`#${name}UW`);
    const brkEl   = document.getElementById(name + "Break");

    if (!priceEl || !dbEl || !uwEl || !brkEl) return; // not on final slide yet

    priceEl.textContent = money(mode === "Monthly" ? billed : annual);
    dbEl.textContent    = money(tierDB, false);
    uwEl.textContent    = uw.label;

    brkEl.innerHTML = `
      <ul class="kv">
        <li><span>Mode</span><strong>${mode}</strong></li>
        <li><span>Tier Multiplier</span><strong>${t.mult.toFixed(2)}</strong></li>
        <li><span>Product Factor</span><strong>${productFactor(inputs.policyType).toFixed(2)}</strong></li>
        <li><span>Age Factor</span><strong>${ageFactor(inputs.age).toFixed(2)}</strong></li>
        <li><span>Smoker Factor</span><strong>${smokerFactor(inputs.policyType, inputs.smoker).toFixed(2)}</strong></li>
        <li><span>Conditions</span><strong>${conditionsMultiplier(inputs.selectedConditions).toFixed(2)}</strong></li>
        <li><span>Policy Fee</span><strong>${money(inputs.policyFee)}</strong></li>
        <li><span>Riders</span><strong>${t.riders.length ? t.riders.join(", ") : "None"}</strong></li>
      </ul>
    `;
  });
}

function bind(key, val){
  $$(`[data-bind="${key}"]`).forEach(el => el.textContent = val ?? "");
}

/* ====== Actions ====== */
function attachEvents(){
  // Form changes
  $("#clientForm").addEventListener("input", (e)=>{
    if (e.target.name === "goal") syncGoalToggle();
    recompute();
  });
  $$("input[name=goal]").forEach(r => r.addEventListener("change", ()=>{ syncGoalToggle(); recompute(); }));
  $$("input[name=mode]").forEach(r => r.addEventListener("change", recompute));

  // Print
  $("#printBtn").addEventListener("click", () => window.print());

  // Tooltips / calc explainer
  $("#howCalcBtn").addEventListener("click", ()=>{
    alert(`Premium math (annual base → modal): 
base = (DB/1k) × base_rate_per_1k(age, sex, product)
premium = base × age × smoker × product × conditions × UW
+ riders (annualized) + policy fee × 12
Modal billed = annual × modal_factor

Examples (annual per $1k):
Term(20): 0.72 + 0.024×(age-30) (min 0.36)
Whole: 1.20 + 0.048×(age-30) (min 0.72)
Final Expense: flat by decade (50s: 1.68; 60s: 2.64; 70s: 4.56)`);
  });

  // Copy plan summary
  $("#copyPlanBtn").addEventListener("click", () => {
    const t = buildPlanSummaryText();
    navigator.clipboard.writeText(t);
  });

  // Save JSON
  $("#saveClientBtn").addEventListener("click", () => {
    const { inputs } = state.lastCalc || {};
    if (!inputs) return;
    const out = { version: VERSION, timestamp: new Date().toISOString(), inputs };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:"application/json"}));
    a.download = `client_summary_${Date.now()}.json`;
    a.click();
  });

  // Plan CTA demo
  $$(".plan-cta").forEach(btn => btn.addEventListener("click", () => alert("Plan selected — proceed to e-app (demo).")));
}

function buildPlanSummaryText(){
  const { inputs } = state.lastCalc || {};
  const mode = inputs.modalSel;
  const bronze = $("#bronzePrice").textContent;
  const silver = $("#silverPrice").textContent;
  const gold = $("#goldPrice").textContent;
  return [
    `Recommendation (${mode})`,
    `Bronze: ${bronze}, DB ${$("#bronzeDB").textContent}, ${$("#bronzeUW").textContent}`,
    `Silver: ${silver}, DB ${$("#silverDB").textContent}, ${$("#silverUW").textContent}`,
    `Gold: ${gold}, DB ${$("#goldDB").textContent}, ${$("#goldUW").textContent}`
  ].join("\n");
}

/* ====== Init ====== */
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", async () => {
    // Load data
    state.company = await loadJSON("data/company.json", "fallback-company");
    state.conditions = await loadJSON("data/conditions.json", "fallback-conditions");
    state.objections = await loadJSON("data/objections.json", "fallback-objections");

    // Brand visuals
    $("#brandName").textContent = state.company.brand.name;
    $("#brandTag").textContent = state.company.brand.tagline;
    $("#brandLogo").src = state.company.brand.logo;

    // Slides + UI
    Slides.init();
    populateSelect($("#state"), STATE_OPTIONS, "MI");
    populateSelect($("#policyType"), POLICY_TYPES, "Term");
    populateSelect($("#term"), TERM_OPTIONS, 20);
    buildConditionsUI();
    attachEvents();
    syncGoalToggle();

    // First compute
    recompute();
  });
}

// Export helpers for Node/CommonJS consumers (e.g., unit tests)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    baseRatePer1k,
    ageFactor,
    smokerFactor,
    productFactor,
    conditionsMultiplier,
    riderCost,
    computePremium,
    solveDeathBenefit,
  };
}
