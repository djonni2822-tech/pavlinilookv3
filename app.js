/* ============================================================
   Студия взгляда Елены Павленко — mini-service
   Статический JS: подбор услуг, расчёт стоимости, карточка мастера
   ============================================================ */
"use strict";

/* ---------------- Прайс (только эти услуги) ---------------- */
const PRICES = {
  "1D": 2100,
  "1.5D": 2200,
  "2D": 2300,
  "3D": 2400,
  shading: 200,
  removalOwn: 200,
  removalOther: 300,
  correction: 300,
  architecture: 900,
  extraZone: 300,
};

const VOLUME_ORDER = ["1D", "1.5D", "2D", "3D"];
const VOLUME_TEXT = {
  "1D": "Максимально натуральный результат — будто ваши ресницы, только красивее.",
  "1.5D": "Натуральный, но заметный результат. Хороший баланс лёгкости и выразительности.",
  "2D": "Выразительный, открытый взгляд с красивым заметным объёмом.",
  "3D": "Максимальный объём и яркий, эффектный взгляд.",
};

/* ---------------- Состояние ---------------- */
const freshState = () => ({
  name: "",
  direction: null,           // 'lashes' | 'brows' | 'both' | 'unknown'
  scores: { "1D": 0, "1.5D": 0, "2D": 0, "3D": 0 },
  answers: {},               // тексты ответов для карточки мастера
  lashPicks: {},             // {n: {scores, answer}} для пересчёта при возврате назад
  removal: null,             // 'none' | 'own' | 'other'
  shading: null,             // 'yes' | 'no' | 'unsure'
  volume: null,              // выбранный объём
  brows: null,               // 'correction' | 'architecture'
  browsSource: null,         // 'main' | 'clarify'
  extraZone: null,           // 'no' | 'yes1' | 'unsure'
  contact: { phone: "", channel: "", time: "", comment: "" },
});
let state = freshState();
let flow = [];
let historyStack = [];

/* ---------------- Утилиты ---------------- */
const app = document.getElementById("app");
const topbar = document.getElementById("topbar");
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const toast = document.getElementById("toast");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt = (n) => `${n.toLocaleString("ru-RU")} ₽`;

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

const CHECK_SVG = `<svg class="check-icon" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>`;

function optionCard({ emoji, title, desc, price, value }) {
  return `
  <button class="option" data-value="${esc(value)}">
    ${emoji ? `<span class="option__emoji">${emoji}</span>` : ""}
    <span class="option__body">
      <span class="option__title">${title}</span>
      ${desc ? `<span class="option__desc">${desc}</span>` : ""}
    </span>
    ${price ? `<span class="option__price">${price}</span>` : ""}
    <span class="option__check">${CHECK_SVG}</span>
  </button>`;
}

/* ---------------- Навигация ---------------- */
const QUIZ_STEPS = new Set(["name", "direction", "removal", "shading", "wow",
  "browsMain", "browsClarify", "extraZone", "final"]);

function buildFlow() {
  flow = ["name", "direction"];
  if (state.direction === "lashes" || state.direction === "both" || state.direction === "unknown") {
    flow.push("lashQ1", "lashQ2", "lashQ3", "lashQ4", "removal", "shading", "wow");
  }
  if (state.direction === "brows" || state.direction === "both" || state.direction === "unknown") {
    flow.push("browsMain");
    if (state.browsSource === "clarify") flow.push("browsClarify");
  }
  flow.push("extraZone", "final");
}

function updateProgress(stepId) {
  if (!QUIZ_STEPS.has(stepId)) {
    progressWrap.hidden = true;
    return;
  }
  buildFlow();
  const idx = flow.indexOf(stepId);
  const total = flow.length;
  progressWrap.hidden = false;
  progressFill.style.width = `${Math.max(6, ((idx + 1) / total) * 100)}%`;
  progressLabel.textContent = `Шаг ${idx + 1} из ${total}`;
}

function render(stepId, { pushHistory = true } = {}) {
  if (pushHistory && historyStack[historyStack.length - 1] !== stepId) {
    historyStack.push(stepId);
  }
  topbar.hidden = (stepId === "intro");
  updateProgress(stepId);
  const renderers = {
    intro: renderIntro, name: renderName, direction: renderDirection,
    lashQ1: () => renderLashQ(1), lashQ2: () => renderLashQ(2),
    lashQ3: () => renderLashQ(3), lashQ4: () => renderLashQ(4),
    removal: renderRemoval, shading: renderShading, wow: renderWow,
    browsMain: renderBrowsMain, browsClarify: renderBrowsClarify,
    extraZone: renderExtraZone, final: renderFinal,
    contact: renderContact, master: renderMaster, done: renderDone,
    price: renderPrice,
  };
  window.scrollTo({ top: 0, behavior: "instant" });
  renderers[stepId]();
}

function goBack() {
  if (historyStack.length <= 1) return;
  historyStack.pop();
  const prev = historyStack[historyStack.length - 1];
  render(prev, { pushHistory: false });
}

function restart() {
  state = freshState();
  historyStack = [];
  render("intro", { pushHistory: false });
}

document.getElementById("btnBack").addEventListener("click", goBack);
document.getElementById("btnRestart").addEventListener("click", () => {
  showToast("Начинаем подбор заново ✨");
  restart();
});

/* Опции: выбор + авто-переход */
function bindOptions(container, onPick, { autoAdvance = true } = {}) {
  container.addEventListener("click", (e) => {
    const card = e.target.closest(".option");
    if (!card) return;
    container.querySelectorAll(".option").forEach((o) => o.classList.remove("option--selected"));
    card.classList.add("option--selected");
    const value = card.dataset.value;
    if (autoAdvance) {
      setTimeout(() => onPick(value), 340);
    } else {
      onPick(value);
    }
  });
}

/* ============================================================
   3D-ГЛАЗ (SVG, генерируется кодом)
   ============================================================ */
function eyeSVG() {
  const cx = 200, cy = 158;
  // Верхняя линия глаза (квадратичная): A(58,160) C(200,56) B(342,160)
  const qPoint = (t, A, C, B) => {
    const x = (1 - t) ** 2 * A[0] + 2 * (1 - t) * t * C[0] + t ** 2 * B[0];
    const y = (1 - t) ** 2 * A[1] + 2 * (1 - t) * t * C[1] + t ** 2 * B[1];
    return [x, y];
  };
  const A = [58, 160], C = [200, 56], B = [342, 160];

  // Ресницы: верхние
  let upperLashes = "";
  const N = 19;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const [bx, by] = qPoint(t, A, C, B);
    const tx = 2 * (1 - t) * (C[0] - A[0]) + 2 * t * (B[0] - C[0]);
    const ty = 2 * (1 - t) * (C[1] - A[1]) + 2 * t * (B[1] - C[1]);
    const len = Math.hypot(tx, ty);
    const nx = -ty / len, ny = -tx / len; // нормаль вверх
    const centerBoost = Math.sin(Math.PI * t);
    const L = 30 + 42 * centerBoost;
    const curl = 14 + 18 * centerBoost;
    const sweep = (t - 0.5) * 26;
    const tipx = bx + nx * L - sweep * 0.4;
    const tipy = by + ny * L - curl * 0.35;
    const mdx = bx + nx * L * 0.5 + sweep * 0.3;
    const mdy = by + ny * L * 0.5;
    upperLashes += `<path class="lash" style="animation-delay:${(i * 0.09).toFixed(2)}s"
      d="M ${bx.toFixed(1)} ${by.toFixed(1)} Q ${mdx.toFixed(1)} ${mdy.toFixed(1)} ${tipx.toFixed(1)} ${tipy.toFixed(1)}"
      stroke="url(#lashGrad)" stroke-width="${(4.6 - 1.8 * Math.abs(t - 0.5) * 2).toFixed(1)}"
      fill="none" stroke-linecap="round"/>`;
  }
  // Ресницы: нижние
  let lowerLashes = "";
  const AL = [84, 176], CL = [200, 216], BL = [316, 176];
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const [bx, by] = qPoint(t, AL, CL, BL);
    const L = 10 + 9 * Math.sin(Math.PI * t);
    lowerLashes += `<path class="lash lash--lower" style="animation-delay:${(i * 0.11 + 0.4).toFixed(2)}s"
      d="M ${bx.toFixed(1)} ${by.toFixed(1)} q ${(4 - 8 * t).toFixed(1)} ${L.toFixed(1)} ${(10 - 20 * t).toFixed(1)} ${(L + 5).toFixed(1)}"
      stroke="url(#lashGrad)" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".85"/>`;
  }

  const irisFibers = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2;
    const r1 = 40, r2 = 64;
    return `<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}"
      x2="${cx + Math.cos(a) * r2}" y2="${cy + Math.sin(a) * r2}"
      stroke="#0a4a40" stroke-width="1.6"/>`;
  }).join("");

  return `
  <svg viewBox="0 0 400 400" aria-hidden="true">
    <defs>
      <radialGradient id="irisGrad" cx="42%" cy="38%" r="72%">
        <stop offset="0%" stop-color="#c8f2e6"/>
        <stop offset="34%" stop-color="#5ec9b2"/>
        <stop offset="68%" stop-color="#12806f"/>
        <stop offset="100%" stop-color="#0a4a40"/>
      </radialGradient>
      <radialGradient id="irisGlowGrad" cx="50%" cy="50%" r="50%">
        <stop offset="55%" stop-color="rgba(94,201,178,0)"/>
        <stop offset="82%" stop-color="rgba(230,207,154,.55)"/>
        <stop offset="100%" stop-color="rgba(230,207,154,0)"/>
      </radialGradient>
      <linearGradient id="lashGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a5248"/>
        <stop offset="100%" stop-color="#0b3a32"/>
      </linearGradient>
      <radialGradient id="whiteGrad" cx="50%" cy="42%" r="75%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="78%" stop-color="#f4f8f5"/>
        <stop offset="100%" stop-color="#dcebe4"/>
      </radialGradient>
      <linearGradient id="linerGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#1c443c"/>
        <stop offset="50%" stop-color="#0e332c"/>
        <stop offset="100%" stop-color="#1c443c"/>
      </linearGradient>
      <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0e4f46" flood-opacity=".22"/>
      </filter>
      <filter id="irisBlur"><feGaussianBlur stdDeviation="1.1"/></filter>
      <clipPath id="eyeClip">
        <path d="M 58 160 Q 200 56 342 160 Q 200 258 58 160 Z"/>
      </clipPath>
    </defs>

    <g filter="url(#softShadow)">
      <path d="M 58 160 Q 200 56 342 160 Q 200 258 58 160 Z" fill="url(#whiteGrad)"/>
      <g clip-path="url(#eyeClip)">
        <circle cx="${cx}" cy="${cy}" r="86" fill="url(#irisGlowGrad)" class="iris-glow"/>
        <circle cx="${cx}" cy="${cy}" r="67" fill="url(#irisGrad)"/>
        <g filter="url(#irisBlur)" opacity=".5">${irisFibers}</g>
        <circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="rgba(230,207,154,.8)" stroke-width="2.4"/>
        <circle cx="${cx}" cy="${cy}" r="74" fill="none" stroke="rgba(201,162,75,.35)" stroke-width="1"/>
        <circle cx="${cx}" cy="${cy}" r="29" fill="#07271f"/>
        <circle cx="${cx}" cy="${cy}" r="29" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.4"/>
        <g class="eye-shine">
          <ellipse cx="${cx - 20}" cy="${cy - 24}" rx="14" ry="9" fill="#ffffff" opacity=".95" transform="rotate(-24 ${cx - 20} ${cy - 24})"/>
          <circle cx="${cx + 22}" cy="${cy + 16}" r="5.5" fill="#ffffff" opacity=".7"/>
        </g>
        <circle cx="${cx - 34}" cy="${cy + 22}" r="2.6" fill="#e6cf9a" opacity=".9"/>
      </g>
      <path d="M 58 160 Q 200 56 342 160" fill="none" stroke="url(#linerGrad)" stroke-width="6.5" stroke-linecap="round"/>
      <path d="M 84 176 Q 200 216 316 176" fill="none" stroke="url(#linerGrad)" stroke-width="3.4" stroke-linecap="round" opacity=".9"/>
      ${lowerLashes}
      ${upperLashes}
    </g>
  </svg>`;
}

function spawnParticles(stage) {
  const colors = ["#e6cf9a", "#c9a24b", "#9fd6c9", "#ffffff", "#c3e6dd"];
  for (let i = 0; i < 16; i++) {
    const p = document.createElement("span");
    p.className = "particle";
    const size = 2.5 + Math.random() * 4.5;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${8 + Math.random() * 84}%;
      top:${30 + Math.random() * 60}%;
      background:${colors[i % colors.length]};
      box-shadow:0 0 ${6 + size}px ${colors[i % colors.length]};
      --po:${(0.35 + Math.random() * 0.5).toFixed(2)};
      animation-duration:${(6 + Math.random() * 7).toFixed(1)}s;
      animation-delay:${(-Math.random() * 10).toFixed(1)}s;`;
    stage.appendChild(p);
  }
}

function initHeroMotion(stage, eye) {
  let raf = null, tx = 0, ty = 0, cx2 = 0, cy2 = 0;
  const apply = () => {
    cx2 += (tx - cx2) * 0.08;
    cy2 += (ty - cy2) * 0.08;
    eye.style.transform = `rotateY(${cx2 * 10}deg) rotateX(${-cy2 * 8}deg) translateZ(12px)`;
    const halo = stage.querySelector(".hero__halo");
    const ring = stage.querySelector(".hero__ring");
    if (halo) halo.style.transform = `translate(${cx2 * 12}px, ${cy2 * 10}px)`;
    if (ring) ring.style.transform = `translate(${cx2 * -8}px, ${cy2 * -6}px)`;
    if (Math.abs(tx - cx2) > 0.001 || Math.abs(ty - cy2) > 0.001) raf = requestAnimationFrame(apply);
    else raf = null;
  };
  const onMove = (x, y) => {
    const r = stage.getBoundingClientRect();
    tx = ((x - r.left) / r.width - 0.5) * 2;
    ty = ((y - r.top) / r.height - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(apply);
  };
  stage.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
  stage.addEventListener("pointerleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply); });
  window.addEventListener("deviceorientation", (e) => {
    if (e.gamma == null) return;
    tx = Math.max(-1, Math.min(1, e.gamma / 28));
    ty = Math.max(-1, Math.min(1, (e.beta - 45) / 28));
    if (!raf) raf = requestAnimationFrame(apply);
  });

  // моргание
  const blink = () => {
    if (!document.body.contains(eye)) return;
    eye.classList.add("blinking");
    setTimeout(() => eye.classList.remove("blinking"), 380);
    setTimeout(blink, 3400 + Math.random() * 3200);
  };
  setTimeout(blink, 2200);
}

/* ============================================================
   ЭКРАНЫ
   ============================================================ */

/* ---------- 1. Intro ---------- */
function renderIntro() {
  app.innerHTML = `
  <section class="screen screen--no-top hero">
    <span class="kicker">Студия взгляда Елены Павленко</span>
    <div class="hero__stage" id="heroStage">
      <div class="hero__halo"></div>
      <div class="hero__ring"></div>
      <div class="eye3d" id="eye3d">${eyeSVG()}</div>
    </div>
    <h1 class="title">Ваш идеальный взгляд<br><em>начинается здесь</em></h1>
    <p class="subtitle" style="margin:0 auto">Пройдите короткий персональный подбор — за 1–2 минуты узнаете, какой объём ресниц и оформление бровей подойдут именно вам.</p>
    <p class="personal" style="margin-top:8px">Без сложных терминов. Просто выбирайте то, что вам нравится.</p>
    <div class="hero__cta">
      <button class="btn btn--primary" id="btnStart">Подобрать мой вариант</button>
      <button class="btn btn--ghost" id="btnPrice">Посмотреть прайс</button>
    </div>
    <p class="hero__note">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.9L21 9.3l-5.4 4.4 1.7 7L12 16.6 6.7 20.7l1.7-7L3 9.3l6.6-.4z"/></svg>
      1–2 минуты · предварительная стоимость сразу
    </p>
    <p class="footer-note">С любовью к деталям · Студия взгляда Елены Павленко</p>
  </section>`;
  const stage = document.getElementById("heroStage");
  const eye = document.getElementById("eye3d");
  spawnParticles(stage);
  initHeroMotion(stage, eye);
  document.getElementById("btnStart").addEventListener("click", () => render("name"));
  document.getElementById("btnPrice").addEventListener("click", () => render("price"));
}

/* ---------- Прайс ---------- */
function renderPrice() {
  app.innerHTML = `
  <section class="screen price-screen">
    <span class="kicker">Студия взгляда</span>
    <h1 class="title">Прайс</h1>
    <p class="subtitle">Честные цены. Окончательный вариант мастер подтвердит перед процедурой.</p>

    <div class="price-group">
      <div class="result-section__title">Наращивание ресниц</div>
      <div class="price-item"><span class="price-item__name">Классическое · 1D</span><span class="price-item__val">${fmt(PRICES["1D"])}</span></div>
      <div class="price-item"><span class="price-item__name">Полтора объёма · 1.5D</span><span class="price-item__val">${fmt(PRICES["1.5D"])}</span></div>
      <div class="price-item"><span class="price-item__name">Двойной объём · 2D</span><span class="price-item__val">${fmt(PRICES["2D"])}</span></div>
      <div class="price-item"><span class="price-item__name">Тройной объём · 3D</span><span class="price-item__val">${fmt(PRICES["3D"])}</span></div>
      <div class="price-item"><span class="price-item__name">Растушёвка</span><span class="price-item__val">${fmt(PRICES.shading)}</span></div>
      <div class="price-item"><span class="price-item__name">Снятие своей работы</span><span class="price-item__val">${fmt(PRICES.removalOwn)}</span></div>
      <div class="price-item"><span class="price-item__name">Снятие чужой работы</span><span class="price-item__val">${fmt(PRICES.removalOther)}</span></div>
    </div>

    <div class="price-group">
      <div class="result-section__title">Оформление бровей</div>
      <div class="price-item"><span class="price-item__name">Коррекция воском / пинцетом</span><span class="price-item__val">${fmt(PRICES.correction)}</span></div>
      <div class="price-item"><span class="price-item__name">Архитектура бровей</span><span class="price-item__val">${fmt(PRICES.architecture)}</span></div>
      <div class="price-item"><span class="price-item__name">Удаление волосков на лице · 1 зона</span><span class="price-item__val">${fmt(PRICES.extraZone)}</span></div>
    </div>

    <div class="price-group">
      <div class="result-section__title">Комплекс</div>
      <div class="price-item price-item--accent"><span class="price-item__name">Ресницы + брови в комплексе</span><span class="price-item__val">${fmt(600)}</span></div>
    </div>

    <div class="info-block">💛 Позиция «ресницы + брови — 600 ₽» действует как комплексная. Условия уточните у мастера.</div>

    <div class="mt-32"><button class="btn btn--primary" id="btnStart2">Подобрать мой вариант</button></div>
  </section>`;
  document.getElementById("btnStart2").addEventListener("click", () => render("name"));
}

/* ---------- 2. Имя ---------- */
function renderName() {
  app.innerHTML = `
  <section class="screen">
    <div class="spacer"></div>
    <div class="center">
      <span class="kicker">Знакомство</span>
      <h1 class="title">Как к вам<br><em>обращаться?</em> 💛</h1>
    </div>
    <div class="field">
      <label class="field__label" for="nameInput">Ваше имя</label>
      <input class="field__input" id="nameInput" type="text" maxlength="30"
        placeholder="Например, Анна" autocomplete="given-name" value="${esc(state.name)}">
    </div>
    <div class="mt-24"><button class="btn btn--primary" id="btnNameNext" disabled>Продолжить</button></div>
    <div class="spacer"></div>
  </section>`;
  const input = document.getElementById("nameInput");
  const btn = document.getElementById("btnNameNext");
  const sync = () => { btn.disabled = input.value.trim().length < 2; };
  input.addEventListener("input", sync);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !btn.disabled) btn.click(); });
  sync();
  setTimeout(() => input.focus(), 350);
  btn.addEventListener("click", () => {
    state.name = input.value.trim();
    render("direction");
  });
}

/* ---------- 3. Направление ---------- */
function renderDirection() {
  const n = esc(state.name);
  app.innerHTML = `
  <section class="screen">
    <span class="kicker">${n}, начнём</span>
    <h1 class="title">Что сегодня<br><em>хочется сделать?</em></h1>
    <div class="options" id="opts">
      ${optionCard({ emoji: "👁", title: "Ресницы", desc: "Подобрать наращивание", value: "lashes" })}
      ${optionCard({ emoji: "🤎", title: "Брови", desc: "Подобрать оформление", value: "brows" })}
      ${optionCard({ emoji: "✨", title: "Ресницы + брови", desc: "Собрать полный образ", value: "both" })}
      ${optionCard({ emoji: "🤷‍♀️", title: "Пока не знаю", desc: "Помогите подобрать", value: "unknown" })}
    </div>
    <div class="spacer"></div>
  </section>`;
  bindOptions(document.getElementById("opts"), (v) => {
    state.direction = v;
    historyStack = ["intro", "name", "direction"];
    buildFlow();
    render(flow[3] || "extraZone");
  });
}

/* ---------- 4–7. Вопросы по ресницам ---------- */
const LASH_QUESTIONS = {
  1: {
    title: "Какой результат вам<br><em>нравится больше?</em>",
    options: [
      { emoji: "🌿", t: "Очень натурально", d: "Будто свои ресницы, только красивее", v: "natural", s: { "1D": 3, "1.5D": 1 }, a: "Очень натурально" },
      { emoji: "✨", t: "Натурально, но заметно", d: "Аккуратно и выразительно", v: "natNotice", s: { "1D": 1, "1.5D": 3, "2D": 1 }, a: "Натурально, но заметно" },
      { emoji: "👁", t: "Выразительный взгляд", d: "Ресницы хорошо заметны", v: "expressive", s: { "1.5D": 1, "2D": 3, "3D": 1 }, a: "Выразительный взгляд" },
      { emoji: "🔥", t: "Хочу объём", d: "Чем эффектнее — тем лучше", v: "volume", s: { "2D": 1, "3D": 4 }, a: "Максимальный объём" },
    ],
    key: "result",
  },
  2: {
    title: "Что для вас<br><em>важнее всего?</em>",
    options: [
      { emoji: "🌿", t: "Естественность", v: "natural", s: { "1D": 3 }, a: "Естественность" },
      { emoji: "🪶", t: "Лёгкость", v: "light", s: { "1D": 2, "1.5D": 1 }, a: "Лёгкость" },
      { emoji: "👁", t: "Выразительность", v: "expressive", s: { "1.5D": 1, "2D": 3 }, a: "Выразительность" },
      { emoji: "💄", t: "Заметный эффект", v: "noticeable", s: { "2D": 2, "3D": 1 }, a: "Заметный эффект" },
      { emoji: "🔥", t: "Максимальный объём", v: "maxvol", s: { "3D": 4 }, a: "Максимальный объём" },
    ],
    key: "priority",
  },
  3: {
    title: "Какая густота<br><em>вам ближе?</em>",
    options: [
      { emoji: "1️⃣", t: "Очень лёгкие", d: "Минимум объёма", v: "q3_1", s: { "1D": 3 }, a: "Очень лёгкие" },
      { emoji: "2️⃣", t: "Лёгкий объём", d: "Мягко и заметно", v: "q3_2", s: { "1.5D": 3 }, a: "Лёгкий объём" },
      { emoji: "3️⃣", t: "Выразительные", d: "Более плотный взгляд", v: "q3_3", s: { "2D": 3 }, a: "Выразительные" },
      { emoji: "4️⃣", t: "Густые и яркие", d: "Максимально эффектный результат", v: "q3_4", s: { "3D": 4 }, a: "Густые и яркие" },
    ],
    key: "density",
  },
  4: {
    title: "Как часто вы<br><em>красите глаза?</em>",
    options: [
      { emoji: "🙅‍♀️", t: "Почти никогда", v: "never", s: { "1D": 2 }, a: "Почти никогда" },
      { emoji: "🌸", t: "Иногда", v: "sometimes", s: { "1D": 1, "1.5D": 2 }, a: "Иногда" },
      { emoji: "🖌", t: "Почти каждый день", v: "daily", s: { "1.5D": 1, "2D": 2 }, a: "Почти каждый день" },
      { emoji: "💋", t: "Люблю яркий макияж", v: "bright", s: { "2D": 1, "3D": 2 }, a: "Люблю яркий макияж" },
    ],
    key: "makeup",
  },
};

function renderLashQ(n) {
  const q = LASH_QUESTIONS[n];
  app.innerHTML = `
  <section class="screen">
    <span class="kicker">${esc(state.name)}, о ресницах</span>
    <h1 class="title">${q.title}</h1>
    <div class="options" id="opts">
      ${q.options.map((o) => optionCard({ emoji: o.emoji, title: o.t, desc: o.d, value: o.v })).join("")}
    </div>
    <div class="spacer"></div>
  </section>`;
  bindOptions(document.getElementById("opts"), (v) => {
    const picked = q.options.find((o) => o.v === v);
    // при повторном ответе (возврат назад) вычитаем старые баллы
    const prev = state.lashPicks[n];
    if (prev) {
      Object.entries(prev.scores).forEach(([k, pts]) => { state.scores[k] -= pts; });
    }
    Object.entries(picked.s).forEach(([k, pts]) => { state.scores[k] += pts; });
    state.lashPicks[n] = { scores: picked.s, answer: picked.a };
    state.answers[q.key] = picked.a;
    render(flow[flow.indexOf("lashQ" + n) + 1]);
  });
}

/* ---------- 8. Снятие ---------- */
function renderRemoval() {
  app.innerHTML = `
  <section class="screen">
    <span class="kicker">Небольшой нюанс</span>
    <h1 class="title">Есть ли сейчас<br><em>наращённые ресницы?</em></h1>
    <div class="options" id="opts">
      ${optionCard({ emoji: "🚫", title: "Нет", desc: "Начнём с чистого листа", price: "+0 ₽", value: "none" })}
      ${optionCard({ emoji: "💛", title: "Да, работа этого мастера", desc: "Аккуратно снимем перед процедурой", price: "+200 ₽", value: "own" })}
      ${optionCard({ emoji: "🔍", title: "Да, работа другого мастера", desc: "Снимем с особым вниманием", price: "+300 ₽", value: "other" })}
    </div>
    <div class="spacer"></div>
  </section>`;
  bindOptions(document.getElementById("opts"), (v) => {
    state.removal = v;
    render("shading");
  });
}

/* ---------- 9. Растушёвка ---------- */
function renderShading() {
  app.innerHTML = `
  <section class="screen">
    <span class="kicker">Финальный штрих</span>
    <h1 class="title">Хотите добавить<br><em>растушёвку?</em></h1>
    <p class="subtitle">Она помогает сделать переход визуально мягче.</p>
    <div class="options" id="opts">
      ${optionCard({ emoji: "🌫", title: "Да, хочу", desc: "Мягкий переход без резкой границы", price: "+200 ₽", value: "yes" })}
      ${optionCard({ emoji: "✋", title: "Нет", desc: "Классическая подводка взгляда", value: "no" })}
      ${optionCard({ emoji: "🤷‍♀️", title: "Не знаю", desc: "Можно решить вместе с мастером", value: "unsure" })}
    </div>
    <div class="spacer"></div>
  </section>`;
  bindOptions(document.getElementById("opts"), (v) => {
    state.shading = v;
    render("wow");
  });
}

/* ---------- Рекомендация ---------- */
function computeRecommendation() {
  const sorted = VOLUME_ORDER.slice().sort((a, b) => state.scores[b] - state.scores[a]);
  const top = sorted[0], second = sorted[1];
  const twoOptions = state.scores[top] - state.scores[second] <= 1;
  return { top, second, twoOptions };
}

function renderWow() {
  const { top, second, twoOptions } = computeRecommendation();
  state.volume = top;
  const n = esc(state.name);
  app.innerHTML = `
  <section class="screen wow">
    <div class="spacer"></div>
    <div class="wow__badge">✨</div>
    <p class="subtitle" style="margin:10px auto 0">${n}, кажется, мы уже близко</p>
    ${twoOptions ? `
      <h2 class="title" style="margin-top:14px">Вам подходят<br><em>два варианта</em></h2>
      <div class="wow__alt" style="width:100%">
        <div class="wow__alt-title">Предварительная рекомендация</div>
        <div class="wow__alt-item"><b>${top}</b> — ${(top === "1D" || top === "1.5D") ? "более лёгкий и натуральный" : "более выразительный"}</div>
        <div class="wow__alt-item"><b>${second}</b> — ${(second === "1D" || second === "1.5D") ? "более лёгкий и натуральный" : "более выразительный"}</div>
        <div class="wow__alt-btns">
          <button class="btn btn--ghost btn--small" data-pick="natural">Хочу натуральнее</button>
          <button class="btn btn--gold btn--small" data-pick="expressive">Хочу выразительнее</button>
        </div>
      </div>` : `
      <div class="volume-display">${top}</div>
      <p class="wow__hint">Предварительная рекомендация: по вашим ответам этот объём подходит вам лучше всего.</p>
      <p class="subtitle" style="margin:14px auto 0; max-width:36ch">${VOLUME_TEXT[top]}</p>
      <div class="mt-32" style="width:100%"><button class="btn btn--primary" id="btnWowNext">Отлично, продолжаем</button></div>`}
    <div class="spacer"></div>
  </section>`;
  const next = (vol) => {
    state.volume = vol;
    render(flow[flow.indexOf("wow") + 1]);
  };
  if (twoOptions) {
    const pair = [top, second].sort((a, b) => VOLUME_ORDER.indexOf(a) - VOLUME_ORDER.indexOf(b));
    app.querySelector('[data-pick="natural"]').addEventListener("click", () => next(pair[0]));
    app.querySelector('[data-pick="expressive"]').addEventListener("click", () => next(pair[1]));
  } else {
    document.getElementById("btnWowNext").addEventListener("click", () => next(top));
  }
}

/* ---------- Брови ---------- */
function renderBrowsMain() {
  app.innerHTML = `
  <section class="screen">
    <span class="kicker">${esc(state.name)}, о бровях</span>
    <h1 class="title">Что хочется<br><em>изменить?</em></h1>
    <div class="options" id="opts">
      ${optionCard({ emoji: "✨", title: "Просто убрать лишние волоски", desc: "Быстро и аккуратно", price: fmt(PRICES.correction), value: "correction" })}
      ${optionCard({ emoji: "🤎", title: "Сделать аккуратную форму", desc: "Очистим и подчеркнём линию", price: fmt(PRICES.correction), value: "correction" })}
      ${optionCard({ emoji: "📐", title: "Изменить форму", desc: "Подберём новую форму под лицо", price: fmt(PRICES.architecture), value: "architecture" })}
      ${optionCard({ emoji: "⚖️", title: "Брови отличаются друг от друга", desc: "Выровняем асимметрию", price: fmt(PRICES.architecture), value: "architecture" })}
      ${optionCard({ emoji: "💫", title: "Полностью оформить брови", desc: "Форма, симметрия, идеальная чистота", price: fmt(PRICES.architecture), value: "architecture" })}
      ${optionCard({ emoji: "🤷‍♀️", title: "Не знаю", desc: "Поможем разобраться за минуту", value: "idk" })}
    </div>
    <div class="spacer"></div>
  </section>`;
  bindOptions(document.getElementById("opts"), (v) => {
    if (v === "idk") {
      state.browsSource = "clarify";
      historyStack.push("browsClarify");
      render("browsClarify");
    } else {
      state.brows = v;
      state.browsSource = "main";
      render("extraZone");
    }
  });
}

function renderBrowsClarify() {
  app.innerHTML = `
  <section class="screen">
    <span class="kicker">Уточним</span>
    <h1 class="title">Что больше похоже<br><em>на ваши брови?</em></h1>
    <div class="options" id="opts">
      ${optionCard({ emoji: "👌", title: "Форма меня устраивает", desc: "Нужно только убрать лишнее", price: fmt(PRICES.correction), value: "correction" })}
      ${optionCard({ emoji: "📐", title: "Хочу подобрать новую форму", desc: "Создадим форму под черты лица", price: fmt(PRICES.architecture), value: "architecture" })}
      ${optionCard({ emoji: "⚖️", title: "Есть заметная асимметрия", desc: "Выровняем и сбалансируем", price: fmt(PRICES.architecture), value: "architecture" })}
      ${optionCard({ emoji: "💛", title: "Хочу довериться мастеру", desc: "Елена подберёт лучшее решение", price: fmt(PRICES.architecture), value: "architecture" })}
    </div>
    <div class="spacer"></div>
  </section>`;
  bindOptions(document.getElementById("opts"), (v) => {
    state.brows = v;
    render("extraZone");
  });
}

/* ---------- Доп. зона ---------- */
function renderExtraZone() {
  app.innerHTML = `
  <section class="screen">
    <span class="kicker">Ещё немного</span>
    <h1 class="title">Хотите убрать<br><em>нежелательные волоски</em><br>на лице?</h1>
    <div class="options" id="opts">
      ${optionCard({ emoji: "🙅‍♀️", title: "Нет", desc: "Только выбранные услуги", value: "no" })}
      ${optionCard({ emoji: "✨", title: "Да, 1 зона", desc: "Небо, верхняя губа или подбородок", price: "+300 ₽", value: "yes1" })}
      ${optionCard({ emoji: "🤔", title: "Не уверена", desc: "Можно решить на процедуре", value: "unsure" })}
    </div>
    <div class="spacer"></div>
  </section>`;
  bindOptions(document.getElementById("opts"), (v) => {
    state.extraZone = v;
    render("final");
  });
}

/* ---------- Расчёт ---------- */
function calcServices() {
  const rows = [];
  const hasLashes = state.direction === "lashes" || state.direction === "both" || state.direction === "unknown";
  const hasBrows = state.direction === "brows" || state.direction === "both" || state.direction === "unknown";

  if (hasLashes && state.volume) {
    rows.push({ section: "Ресницы", name: `Наращивание · ${state.volume}`, price: PRICES[state.volume], note: VOLUME_TEXT[state.volume] });
    if (state.removal === "own") rows.push({ section: "Дополнительно", name: "Снятие своей работы", price: PRICES.removalOwn });
    if (state.removal === "other") rows.push({ section: "Дополнительно", name: "Снятие чужой работы", price: PRICES.removalOther });
    if (state.shading === "yes") rows.push({ section: "Дополнительно", name: "Растушёвка", price: PRICES.shading });
  }
  if (hasBrows && state.brows) {
    rows.push({
      section: "Брови",
      name: state.brows === "architecture" ? "Архитектура бровей" : "Коррекция бровей воском / пинцетом",
      price: state.brows === "architecture" ? PRICES.architecture : PRICES.correction,
    });
  }
  if (state.extraZone === "yes1") {
    rows.push({ section: "Дополнительно", name: "Удаление волосков на лице · 1 зона", price: PRICES.extraZone });
  }
  const total = rows.reduce((s, r) => s + r.price, 0);
  return { rows, total, hasLashes, hasBrows };
}

/* ---------- Финал ---------- */
function renderFinal() {
  const { rows, total, hasLashes, hasBrows } = calcServices();
  const bySection = {};
  rows.forEach((r) => { (bySection[r.section] = bySection[r.section] || []).push(r); });
  const n = esc(state.name);

  app.innerHTML = `
  <section class="screen">
    <span class="kicker">${n}, готово</span>
    <h1 class="title">${n}, ваш подбор<br><em>готов</em> ✨</h1>

    ${Object.entries(bySection).map(([sec, items]) => `
      <div class="result-section">
        <div class="result-section__title">${sec}</div>
        <div class="result-card">
          ${items.map((r) => `
            <div class="result-card__service">
              <div class="result-card__name">${r.name}${r.note ? `<small>${r.note}</small>` : ""}</div>
              <div class="result-card__price">${fmt(r.price)}</div>
            </div>`).join("")}
        </div>
      </div>`).join("")}

    ${hasLashes && hasBrows ? `
      <div class="info-block">💛 В прайсе также есть позиция <b>«ресницы + брови — 600 ₽»</b>. Условия комплексной цены уточните у мастера.</div>` : ""}

    <div class="total-card">
      <div class="total-card__label">Предварительная стоимость</div>
      <div class="total-card__sum">${fmt(total)}</div>
      <div class="total-card__note">Окончательный вариант мастер подтвердит перед процедурой.</div>
    </div>

    <div class="mt-24"><button class="btn btn--gold" id="btnBook">💌 Хочу записаться</button></div>
    <div class="mt-16"><button class="btn btn--ghost" id="btnEdit">Изменить ответы</button></div>
    <div class="mt-16"><button class="btn btn--ghost" id="btnRestart2">Пройти подбор заново</button></div>
    <div class="spacer"></div>
  </section>`;

  document.getElementById("btnBook").addEventListener("click", () => render("contact"));
  document.getElementById("btnEdit").addEventListener("click", goBack);
  document.getElementById("btnRestart2").addEventListener("click", restart);
}

/* ---------- Контактная форма ---------- */
function renderContact() {
  const chans = ["Telegram", "WhatsApp", "Звонок"];
  const times = ["Будни утром", "Будни днём", "Будни вечером", "Выходные", "Не важно"];
  app.innerHTML = `
  <section class="screen">
    <span class="kicker">Почти у цели</span>
    <h1 class="title">Остался последний<br><em>шаг</em> 💛</h1>

    <div class="field">
      <label class="field__label">Имя</label>
      <input class="field__input" id="cName" type="text" value="${esc(state.name)}" maxlength="30">
    </div>
    <div class="field">
      <label class="field__label">Телефон или ник</label>
      <input class="field__input" id="cPhone" type="text" placeholder="@username или +7 …" value="${esc(state.contact.phone)}">
    </div>
    <div class="field">
      <label class="field__label">Предпочтительный способ связи</label>
      <div class="chips" id="chChannels">
        ${chans.map((c) => `<button class="chip" data-v="${c}">${c}</button>`).join("")}
      </div>
    </div>
    <div class="field">
      <label class="field__label">Когда удобнее прийти?</label>
      <div class="chips" id="chTimes">
        ${times.map((t) => `<button class="chip" data-v="${t}">${t}</button>`).join("")}
      </div>
    </div>
    <div class="field">
      <label class="field__label">Комментарий мастеру</label>
      <textarea class="field__textarea" id="cComment" placeholder="Например: хочу максимально натурально">${esc(state.contact.comment)}</textarea>
    </div>

    <div class="mt-24"><button class="btn btn--primary" id="btnMakeCard" disabled>Сформировать карточку мастеру</button></div>
    <div class="spacer"></div>
  </section>`;

  const chips = (id, current, onSel) => {
    const box = document.getElementById(id);
    box.addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      box.querySelectorAll(".chip").forEach((x) => x.classList.remove("chip--selected"));
      c.classList.add("chip--selected");
      onSel(c.dataset.v);
    });
    if (current) {
      const el = box.querySelector(`[data-v="${CSS.escape(current)}"]`);
      if (el) el.classList.add("chip--selected");
    }
  };
  const btn = document.getElementById("btnMakeCard");
  const phone = document.getElementById("cPhone");
  const sync = () => {
    btn.disabled = !(phone.value.trim().length >= 3 && state.contact.channel && state.contact.time);
  };
  chips("chChannels", state.contact.channel, (v) => { state.contact.channel = v; sync(); });
  chips("chTimes", state.contact.time, (v) => { state.contact.time = v; sync(); });
  phone.addEventListener("input", sync);
  sync();

  btn.addEventListener("click", () => {
    state.name = document.getElementById("cName").value.trim() || state.name;
    state.contact.phone = phone.value.trim();
    state.contact.comment = document.getElementById("cComment").value.trim();
    render("master");
  });
}

/* ---------- Карточка мастера ---------- */
function buildMasterText() {
  const { rows, total } = calcServices();
  const hasLashes = state.direction !== "brows";
  const hasBrows = state.direction !== "lashes";
  const L = [];
  L.push("✨ НОВАЯ ЗАЯВКА — Студия взгляда Елены Павленко");
  L.push("Статус: новый клиент");
  L.push("Источник: mini-site");
  L.push("");
  L.push(`👤 Имя: ${state.name}`);
  L.push(`📱 Контакт: ${state.contact.phone}`);
  L.push(`💬 Связь: ${state.contact.channel}`);
  L.push(`🕐 Удобное время: ${state.contact.time}`);
  if (hasLashes && state.volume) {
    L.push("");
    L.push("👁 РЕСНИЦЫ");
    L.push(`Объём: ${state.volume} (баллы: 1D — ${state.scores["1D"]}, 1.5D — ${state.scores["1.5D"]}, 2D — ${state.scores["2D"]}, 3D — ${state.scores["3D"]})`);
    L.push(`Желаемый результат: ${state.answers.result || "—"}`);
    L.push(`Важнее всего: ${state.answers.priority || "—"}`);
    L.push(`Густота: ${state.answers.density || "—"}`);
    L.push(`Макияж: ${state.answers.makeup || "—"}`);
    const rem = { none: "не требуется", own: `снятие своей работы (+${PRICES.removalOwn} ₽)`, other: `снятие чужой работы (+${PRICES.removalOther} ₽)` }[state.removal];
    L.push(`Снятие: ${rem}`);
    L.push(`Растушёвка: ${{ yes: `да (+${PRICES.shading} ₽)`, no: "нет", unsure: "решить с мастером" }[state.shading]}`);
    L.push(`Стоимость ресниц: ${fmt(PRICES[state.volume])}`);
  }
  if (hasBrows && state.brows) {
    L.push("");
    L.push("🤎 БРОВИ");
    L.push(state.brows === "architecture"
      ? `Архитектура бровей — ${fmt(PRICES.architecture)}`
      : `Коррекция бровей — ${fmt(PRICES.correction)}`);
  }
  const extra = rows.filter((r) => r.section === "Дополнительно");
  if (extra.length) {
    L.push("");
    L.push("✨ ДОПОЛНИТЕЛЬНО");
    extra.forEach((r) => L.push(`${r.name} — ${fmt(r.price)}`));
  }
  if (state.extraZone === "unsure") L.push("Удаление волосков: решить на процедуре");
  L.push("");
  L.push(`💰 Предварительная сумма: ${fmt(total)}`);
  if (state.contact.comment) {
    L.push("");
    L.push(`💬 Комментарий: ${state.contact.comment}`);
  }
  return L.join("\n");
}

function renderMaster() {
  const { rows, total } = calcServices();
  const hasLashes = state.direction !== "brows";
  const hasBrows = state.direction !== "lashes";
  const remText = { none: "Не требуется", own: `Своей работы · +${PRICES.removalOwn} ₽`, other: `Чужой работы · +${PRICES.removalOther} ₽` }[state.removal] || "—";
  const shText = { yes: `Да · +${PRICES.shading} ₽`, no: "Нет", unsure: "Решить с мастером" }[state.shading] || "—";
  const extraRows = rows.filter((r) => r.section === "Дополнительно");

  app.innerHTML = `
  <section class="screen">
    <span class="kicker">Для мастера</span>
    <h1 class="title">Новая<br><em>заявка</em> ✨</h1>

    <div class="master-card">
      <div class="master-card__head">
        <div class="master-card__title">${esc(state.name)}</div>
        <span class="master-card__status">Новый клиент</span>
      </div>
      <div class="master-card__body">
        <div class="mc-row"><span class="mc-row__k">Контакт</span><span class="mc-row__v">${esc(state.contact.phone)}</span></div>
        <div class="mc-row"><span class="mc-row__k">Связь</span><span class="mc-row__v">${esc(state.contact.channel)}</span></div>
        <div class="mc-row"><span class="mc-row__k">Удобное время</span><span class="mc-row__v">${esc(state.contact.time)}</span></div>

        ${hasLashes && state.volume ? `
        <div class="mc-section">
          <div class="mc-section__title">👁 Ресницы</div>
          <div class="mc-row"><span class="mc-row__k">Рекомендованный объём</span><span class="mc-row__v" style="font-size:17px">${state.volume}</span></div>
          <div class="mc-row"><span class="mc-row__k">Стоимость</span><span class="mc-row__v">${fmt(PRICES[state.volume])}</span></div>
          <div class="mc-row"><span class="mc-row__k">Желаемый результат</span><span class="mc-row__v">${esc(state.answers.result || "—")}</span></div>
          <div class="mc-row"><span class="mc-row__k">Важнее всего</span><span class="mc-row__v">${esc(state.answers.priority || "—")}</span></div>
          <div class="mc-row"><span class="mc-row__k">Густота</span><span class="mc-row__v">${esc(state.answers.density || "—")}</span></div>
          <div class="mc-row"><span class="mc-row__k">Макияж</span><span class="mc-row__v">${esc(state.answers.makeup || "—")}</span></div>
          <div class="mc-row"><span class="mc-row__k">Снятие</span><span class="mc-row__v">${remText}</span></div>
          <div class="mc-row"><span class="mc-row__k">Растушёвка</span><span class="mc-row__v">${shText}</span></div>
          <div class="mc-scores">
            <span class="mc-score">1D — ${state.scores["1D"]}</span>
            <span class="mc-score">1.5D — ${state.scores["1.5D"]}</span>
            <span class="mc-score">2D — ${state.scores["2D"]}</span>
            <span class="mc-score">3D — ${state.scores["3D"]}</span>
          </div>
        </div>` : ""}

        ${hasBrows && state.brows ? `
        <div class="mc-section">
          <div class="mc-section__title">🤎 Брови</div>
          <div class="mc-row"><span class="mc-row__k">Услуга</span><span class="mc-row__v">${state.brows === "architecture" ? "Архитектура бровей" : "Коррекция бровей"}</span></div>
          <div class="mc-row"><span class="mc-row__k">Стоимость</span><span class="mc-row__v">${fmt(state.brows === "architecture" ? PRICES.architecture : PRICES.correction)}</span></div>
        </div>` : ""}

        ${(extraRows.length || state.extraZone === "unsure") ? `
        <div class="mc-section">
          <div class="mc-section__title">✨ Дополнительно</div>
          ${extraRows.map((r) => `<div class="mc-row"><span class="mc-row__k">${r.name}</span><span class="mc-row__v">${fmt(r.price)}</span></div>`).join("")}
          ${state.extraZone === "unsure" ? `<div class="mc-row"><span class="mc-row__k">Удаление волосков</span><span class="mc-row__v">Решить на процедуре</span></div>` : ""}
        </div>` : ""}

        <div class="mc-total"><span class="mc-total__k">Предварительная сумма</span><span class="mc-total__v">${fmt(total)}</span></div>

        ${state.contact.comment ? `<div class="mc-comment">«${esc(state.contact.comment)}»</div>` : ""}
      </div>
    </div>

    <div class="mt-24"><button class="btn btn--gold" id="btnCopyCard">📋 Скопировать карточку</button></div>
    <div class="mt-16"><button class="btn btn--ghost" id="btnNewClient">Новый клиент</button></div>
    <div class="spacer"></div>
  </section>`;

  document.getElementById("btnCopyCard").addEventListener("click", async () => {
    const text = buildMasterText();
    try {
      await navigator.clipboard.writeText(text);
      showToast("Карточка скопирована ✨");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast("Карточка скопирована ✨");
    }
    setTimeout(() => render("done"), 700);
  });
  document.getElementById("btnNewClient").addEventListener("click", restart);
}

/* ---------- Экран клиента ---------- */
function renderDone() {
  const { rows, total } = calcServices();
  const parts = [];
  if (state.direction !== "brows" && state.volume) parts.push(state.volume);
  if (state.direction !== "lashes" && state.brows) parts.push(state.brows === "architecture" ? "архитектура бровей" : "коррекция бровей");
  app.innerHTML = `
  <section class="screen wow">
    <div class="spacer"></div>
    <div class="wow__badge">💛</div>
    <h1 class="title" style="margin-top:16px">Заявка<br><em>готова</em></h1>
    <p class="subtitle" style="margin:10px auto 0; text-align:center">Ваш персональный подбор сформирован.<br>Его можно сохранить или отправить мастеру.</p>
    <div class="wow__alt" style="width:100%">
      <div class="wow__alt-title">Ваш выбор</div>
      <div class="wow__alt-item">${parts.map((p) => `<b>${esc(p)}</b>`).join(" + ")}</div>
      <div class="wow__alt-item" style="margin-top:12px; font-size:15px">Предварительно: <b style="color:var(--gold-deep)">${fmt(total)}</b></div>
    </div>
    <div class="mt-24" style="width:100%"><button class="btn btn--primary" id="btnCopyMine">Скопировать мой подбор</button></div>
    <div class="mt-16" style="width:100%"><button class="btn btn--ghost" id="btnAgain">Пройти подбор заново</button></div>
    <div class="spacer"></div>
  </section>`;
  document.getElementById("btnCopyMine").addEventListener("click", async () => {
    const L = ["✨ Мой подбор — Студия взгляда Елены Павленко", ""];
    rows.forEach((r) => L.push(`• ${r.name} — ${fmt(r.price)}`));
    L.push("", `Предварительно: ${fmt(total)}`);
    try {
      await navigator.clipboard.writeText(L.join("\n"));
      showToast("Подбор скопирован 💛");
    } catch { showToast("Не удалось скопировать"); }
  });
  document.getElementById("btnAgain").addEventListener("click", restart);
}

/* ---------------- Старт ---------------- */
render("intro", { pushHistory: false });
