/**
 * UI.js
 * Logic for screens, modals, and shop interactions.
 */

import { SCREENS, CHARACTERS, WEAPON_SKINS, STAT_BOOSTS } from "./constants.js";
import { state } from "./state.js";
import { engine } from "./engine.js";

class UI {
  constructor() {
    this.activeScreen = "title";
    this.selectedChar = null;
    this.cpuChar = null;
    this.difficulty = "normal";
    this.matchHealth = 100;
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.shopTab = "chars";
    this.rotatePromptDismissed = false;
  }

  init() {
    this.canvas = document.getElementById("particle-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.initParticles();
    this.drawParticles();

    this.updateShards(state.spiritShards);
    this.bindEvents();
    this.setupEngineCallbacks();
    this.setupResponsiveScaling();
  }

  bindEvents() {
    // Expose necessary functions to window
    window.startGame = () => this.startGame();
    window.showScreen = (id) => this.showScreen(id);
    window.showModal = (id) => this.showModal(id);
    window.closeModal = (e) => this.closeModal(e);
    window.toggleAudio = () => this.toggleAudio();
    window.selectChar = (id) => this.selectChar(id);
    window.setDifficulty = (d) => this.setDifficulty(d);
    window.setHealth = (h) => this.setHealth(h);
    window.preBattleCutscene = () => this.preBattleCutscene();
    window.togglePause = () => this.togglePause();
    window.initBattle = () => this.initBattle();
    window.endUnlimitedMode = () => this.endUnlimitedMode();
    window.toggleFullscreen = () => this.toggleFullscreen();

    window.setShopTab = (tab) => {
      this.shopTab = tab;
      this.renderShop();
    };
    window.buyCharacter = (id) => this.buyCharacter(id);
    window.buySkin = (id) => this.buySkin(id);
    window.toggleBoost = (id) => this.toggleBoost(id);
    window.dismissRotatePrompt = () => this.dismissRotatePrompt();

    window.addEventListener("resize", () => this.initParticles());
  }

  // --- RESPONSIVE SCALING & ORIENTATION ---
  setupResponsiveScaling() {
    const wrapper = document.getElementById("game-wrapper");
    if (!wrapper) return;

    const scaleWrapper = () => {
      wrapper.style.width = "100dvw";
      wrapper.style.height = "100dvh";
    };

    // Orientation change detection
    const handleOrientation = () => {
      const rotatePrompt = document.getElementById("rotate-prompt");
      const isTouchDevice =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isPortrait = window.innerHeight > window.innerWidth;

      if (!isPortrait) {
        this.rotatePromptDismissed = false;
      }

      if (rotatePrompt) {
        if (isTouchDevice && isPortrait && !this.rotatePromptDismissed) {
          rotatePrompt.style.display = "flex";
        } else {
          rotatePrompt.style.display = "none";
        }
      }

      // Re-evaluate touch layout on orientation change (mid-battle rotate)
      this._applyBattleTouchLayout();
    };

    window.addEventListener("resize", scaleWrapper);
    window.addEventListener("resize", handleOrientation);
    window.addEventListener("orientationchange", handleOrientation);

    scaleWrapper();
    handleOrientation();
  }

  toggleFullscreen() {
    const doc = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (doc.requestFullscreen) doc.requestFullscreen();
      else if (doc.webkitRequestFullscreen) doc.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  }

  dismissRotatePrompt() {
    this.rotatePromptDismissed = true;
    const rotatePrompt = document.getElementById("rotate-prompt");
    if (rotatePrompt) {
      rotatePrompt.style.display = "none";
    }
  }

  setupEngineCallbacks() {
    engine.onHUDUpdate = (p1, cpu, timer) => this.updateHUD(p1, cpu, timer);
    engine.onComboUpdate = (n) => this.updateCombo(n);
    engine.onShake = (amt) => this.shakeScreen(amt);
    engine.onGameEnd = (result, p1, cpu, timer) =>
      this.handleGameEnd(result, p1, cpu, timer);
  }

  showScreen(id) {
    SCREENS.forEach((s) =>
      document.getElementById(`screen-${s}`).classList.remove("active"),
    );
    document.getElementById(`screen-${id}`).classList.add("active");
    this.activeScreen = id;
    if (id === "character-select") this.renderCharSelect();
    if (id === "leaderboard") this.renderLeaderboard();
    if (id === "shop") this.renderShop();

    // Determine orientation-aware touch control layout
    this._applyBattleTouchLayout();
  }

  _applyBattleTouchLayout() {
    const battleScreen = document.getElementById("screen-battle");
    const touchEl = document.getElementById("touch-controls");
    const portraitEl = document.getElementById("touch-controls-portrait");
    if (!battleScreen || !touchEl || !portraitEl) return;

    const isActive = this.activeScreen === "battle";
    const isTouch = engine.isTouchDevice;
    const isPortrait = window.innerHeight > window.innerWidth;

    // Remove both first
    battleScreen.classList.remove("portrait-mode");
    touchEl.classList.remove("active");

    if (isActive && isTouch) {
      if (isPortrait) {
        // Portrait: bottom panel layout
        battleScreen.classList.add("portrait-mode");
      } else {
        // Landscape: overlay controls
        touchEl.classList.add("active");
      }
    }
  }

  showModal(id) {
    document.getElementById(`modal-${id}`).style.display = "flex";
  }
  closeModal(e) {
    if (e && e.target.classList.contains("pause-overlay"))
      e.target.style.display = "none";
    else if (!e)
      document
        .querySelectorAll(".pause-overlay")
        .forEach((m) => m.id.startsWith("modal") && (m.style.display = "none"));
  }

  updateShards(shards) {
    const el = document.getElementById("shard-count");
    if (el) el.innerText = shards;
  }

  toggleAudio() {
    const enabled = engine.toggleAudio();
    document.querySelector(".audio-toggle").innerText = enabled ? "🔊" : "🔇";
  }

  startGame() {
    engine.initAudio();
    this.showScreen("character-select");
  }

  // --- REUSABLE COMPONENTS ---
  createFighterHTML(color) {
    return `<div class="fighter-inner" style="color: ${color}"><div class="sprite-part s-head"></div><div class="sprite-part s-body"></div><div class="sprite-part s-arm-l"></div><div class="sprite-part s-arm-r"></div><div class="sprite-part s-leg-l"></div><div class="sprite-part s-leg-r"></div></div>`;
  }

  renderStat(label, val, color) {
    return `<div class="stat-row"><span style="width:30px">${label}</span><div class="bar-bg"><div class="bar-fill" style="width: ${val * 10}%; background: ${color}; animation: barFillAnim 0.6s ease-out forwards;"></div></div></div>`;
  }

  renderItemCard({
    id,
    title,
    subtitle,
    color,
    unlocked,
    price,
    actionLabel,
    actionOnClick,
    iconHTML,
  }) {
    return `
            <div class="char-card ${unlocked ? "" : "locked"}" id="card-${id}" style="--char-color: ${color || "var(--cyan)"}">
                ${!unlocked ? '<div style="position:absolute; top:10px; right:10px; font-size:1.2rem; z-index:20">🔒</div>' : ""}
                ${iconHTML || ""}
                <div style="font-family:var(--font-display); font-weight:700; margin-top:10px;">${title}</div>
                <div style="font-size:0.8rem; color:#aaa; text-align:center">${subtitle}</div>
                <div style="color:var(--cyan); font-weight:700; margin:10px 0;">
                    ${unlocked ? (price === 0 ? "DEFAULT" : "OWNED") : `💎 ${price}`}
                </div>
                <button class="btn ${unlocked ? "secondary" : ""}" 
                        style="padding:0.5rem 1rem; font-size:0.8rem;" 
                        onclick="${actionOnClick}">
                    ${unlocked ? actionLabel || "EQUIPPED" : "BUY NOW"}
                </button>
            </div>
        `;
  }

  // --- CHARACTER SELECT ---
  renderCharSelect() {
    const grid = document.getElementById("char-grid");
    grid.innerHTML = CHARACTERS.map((c) => {
      const unlocked = state.isUnlocked(c.id);
      return `
                <div class="char-card ${unlocked ? "" : "locked"} ${this.selectedChar?.id === c.id ? "selected" : ""}" 
                     id="card-${c.id}" 
                     onclick="${unlocked ? `selectChar('${c.id}')` : `showScreen('shop')`}"
                     style="--char-color: ${c.color}; opacity: ${unlocked ? 1 : 0.6}; width: 140px; min-height: 180px; padding: 1rem 0.5rem; justify-content: space-between;">
                    ${!unlocked ? '<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:2rem; background:rgba(0,0,0,0.4); z-index:20">🔒</div>' : ""}
                    <div class="sprite-preview" style="transform: scale(0.6) translateY(-20px); margin: 0; display:flex; justify-content:center; align-items:center; height: 100px;">${this.createFighterHTML(c.color)}</div>
                    <div style="font-family:var(--font-display); font-weight:900; font-size: 1rem; text-align: center; margin-top: auto; position: relative; z-index: 100; text-shadow: 0 2px 5px #000, 0 -2px 5px #000, 2px 0 5px #000, -2px 0 5px #000;">${c.name}</div>
                </div>
            `;
    }).join("");

    const detailsBox = document.getElementById("char-details-box");
    if (this.selectedChar) {
      const c = this.selectedChar;
      detailsBox.innerHTML = `
                <div style="font-family:var(--font-display); font-weight:700; font-size: 1.8rem; color: ${c.color}; margin-bottom: 10px; text-align: center;">${c.name}</div>
                <div style="background:${c.color}; padding:4px 15px; border-radius:15px; font-size:0.8rem; margin-bottom: 20px; color: #000; font-weight: 900;">${c.element} Element</div>
                <style>@keyframes barFillAnim { from { width: 0; } }</style>
                <div class="stat-bars" style="width: 100%; text-align: left;">
                    ${this.renderStat("ATK", c.atk, c.color)} 
                    ${this.renderStat("SPD", c.spd, c.color)} 
                    ${this.renderStat("DEF", c.def, c.color)}
                </div>
                <div style="font-size:0.85rem; color:#ccc; text-align:left; margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.5); border-radius: 15px; width: 100%;">
                    <div style="margin-bottom: 8px;"><b style="color:var(--cyan);">Special:</b> ${c.special}</div>
                    <div><b style="color:var(--pink);">Ultimate:</b> ${c.ultimate}</div>
                </div>
            `;
    }
  }

  selectChar(id) {
    this.selectedChar = CHARACTERS.find((c) => c.id === id);
    this.renderCharSelect(); // Refresh for selection visual

    const unlocked = CHARACTERS.filter((c) => state.isUnlocked(c.id));
    this.cpuChar = unlocked[Math.floor(Math.random() * unlocked.length)];

    const cpuReveal = document.getElementById("cpu-reveal");
    cpuReveal.innerText = `CPU: ${this.cpuChar.name}`;
    cpuReveal.style.color = this.cpuChar.color;

    const btn = document.getElementById("fight-btn");
    btn.disabled = false;
    btn.style.opacity = 1;
    btn.style.cursor = "pointer";
  }

  setDifficulty(d) {
    this.difficulty = d;
    document
      .querySelectorAll(".diff-btn")
      .forEach((b) =>
        b.classList.toggle("active", b.innerText.toLowerCase() === d),
      );
  }

  setHealth(h) {
    this.matchHealth = h;
    document
      .querySelectorAll(".health-btn")
      .forEach((b) =>
        b.classList.toggle(
          "active",
          b.innerText.toLowerCase().includes(h.toString().toLowerCase()),
        ),
      );
  }

  endUnlimitedMode() {
    engine.gameEnd("SURVIVAL_END");
  }

  // --- SHOP ---
  renderShop() {
    const grid = document.getElementById("shop-grid");
    let html = `
            <div style="width:100%; display:flex; justify-content:center; gap:10px; margin-bottom:20px;">
                <button class="diff-btn ${this.shopTab === "chars" ? "active" : ""}" onclick="setShopTab('chars')">Warriors</button>
                <button class="diff-btn ${this.shopTab === "skins" ? "active" : ""}" onclick="setShopTab('skins')">Weapon Skins</button>
                <button class="diff-btn ${this.shopTab === "boosts" ? "active" : ""}" onclick="setShopTab('boosts')">Power Boosts</button>
            </div>
        `;

    if (this.shopTab === "chars") {
      html += CHARACTERS.filter((c) => c.price > 0)
        .map((c) =>
          this.renderItemCard({
            id: c.id,
            title: c.name,
            subtitle: c.element + " Warrior",
            color: c.color,
            unlocked: state.isUnlocked(c.id),
            price: c.price,
            actionOnClick: `buyCharacter('${c.id}')`,
            iconHTML: `<div class="sprite-preview" style="transform:scale(0.8)">${this.createFighterHTML(c.color)}</div>`,
          }),
        )
        .join("");
    } else if (this.shopTab === "skins") {
      html += WEAPON_SKINS.map((s) =>
        this.renderItemCard({
          id: s.id,
          title: s.name,
          subtitle: "Glow Effect",
          color: s.color,
          unlocked: state.isSkinUnlocked(s.id),
          price: s.price,
          actionLabel: state.data.activeSkinId === s.id ? "EQUIPPED" : "EQUIP",
          actionOnClick: state.isSkinUnlocked(s.id)
            ? `buySkin('${s.id}')`
            : `buySkin('${s.id}')`,
          iconHTML: `<div style="font-size:4rem; margin:20px 0; color:${s.color || "#fff"}">⚔</div>`,
        }),
      ).join("");
    } else if (this.shopTab === "boosts") {
      html += STAT_BOOSTS.map((b) =>
        this.renderItemCard({
          id: b.id,
          title: b.name,
          subtitle: b.desc,
          color: "var(--orange)",
          unlocked: state.isBoostActive(b.id),
          price: b.price,
          actionLabel: state.isBoostActive(b.id) ? "ACTIVE" : "ACTIVATE",
          actionOnClick: `toggleBoost('${b.id}')`,
          iconHTML: `<div style="font-size:4rem; margin:20px 0; color:var(--orange)">⚡</div>`,
        }),
      ).join("");
    }

    grid.innerHTML = html;
  }

  buyCharacter(id) {
    const char = CHARACTERS.find((c) => c.id === id);
    if (state.isUnlocked(id)) return;
    if (state.spendShards(char.price)) {
      state.unlockCharacter(id);
      this.renderShop();
      this.showToast(`${char.name} Joined the Roster!`);
    } else {
      this.showToast("Not enough Spirit Shards!", true);
    }
  }

  buySkin(id) {
    const skin = WEAPON_SKINS.find((s) => s.id === id);
    if (state.isSkinUnlocked(id)) {
      state.setSkin(id);
      this.renderShop();
      return;
    }
    if (state.spendShards(skin.price)) {
      state.unlockSkin(id);
      state.setSkin(id);
      this.renderShop();
      this.showToast(`${skin.name} Equipped!`);
    } else {
      this.showToast("Not enough Spirit Shards!", true);
    }
  }

  toggleBoost(id) {
    const boost = STAT_BOOSTS.find((b) => b.id === id);
    const alreadyActive = state.isBoostActive(id);

    state.toggleBoost(id);
    this.renderShop();

    if (!alreadyActive) {
      this.showToast(`${boost.name} Activated!`);
    } else {
      this.showToast(`${boost.name} Deactivated.`);
    }
  }

  showToast(msg, isError = false) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${isError ? "error" : ""}`;
    toast.innerText = msg;

    container.appendChild(toast);

    // Auto-remove after animation completes (3s total in CSS)
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // --- BATTLE UI ---
  preBattleCutscene() {
    this.showScreen("vs");
    document.getElementById("vs-p1").innerText = this.selectedChar.name;
    document.getElementById("vs-p1").style.color = this.selectedChar.color;
    document.getElementById("vs-cpu").innerText = this.cpuChar.name;
    document.getElementById("vs-cpu").style.color = this.cpuChar.color;
    setTimeout(() => {
      document.getElementById("vs-p1").style.transform = "translateX(0)";
      document.getElementById("vs-cpu").style.transform = "translateX(0)";
    }, 50);
    setTimeout(() => {
      document.getElementById("vs-text").style.opacity = 1;
    }, 400);
    setTimeout(() => {
      this.initBattle();
    }, 1200);
  }

  initBattle() {
    document
      .querySelectorAll(".proj, .particle, .trail-ghost, .ground-crack")
      .forEach((e) => e.remove());
    document.getElementById("screen-vs").classList.remove("active");
    this.showScreen("battle");

    document.getElementById("p1-name").innerText = this.selectedChar.name;
    document.getElementById("cpu-name").innerText = this.cpuChar.name;

    const arena = document.getElementById("arena");
    arena.style.opacity = 0;
    setTimeout(() => {
      arena.style.opacity = 1;
    }, 50);

    const rt = document.getElementById("round-text");
    rt.innerText = "FIGHT!";
    rt.style.opacity = 1;
    rt.style.transform = "translateY(-50px)";
    setTimeout(() => {
      rt.style.transform = "translateY(0)";
    }, 50);
    setTimeout(() => {
      rt.style.opacity = 0;
    }, 1500);

    const endBtn = document.getElementById("end-unlimited-btn");
    if (this.matchHealth === "unlimited") {
      endBtn.style.display = "block";
    } else {
      endBtn.style.display = "none";
    }

    engine.startBattle(
      this.selectedChar,
      this.cpuChar,
      this.difficulty,
      this.matchHealth,
    );
  }

  updateHUD(p1, cpu, timer) {
    document.getElementById("p1-hp-fill").style.transform =
      `scaleX(${Math.max(0, p1.hp / p1.maxHp)})`;
    document.getElementById("p1-hp-text").innerText =
      `${Math.ceil((p1.hp / p1.maxHp) * 100)}%`;

    document.getElementById("cpu-hp-fill").style.transform =
      `scaleX(${Math.max(0, cpu.hp / cpu.maxHp)})`;
    document.getElementById("cpu-hp-text").innerText =
      `${Math.ceil((cpu.hp / cpu.maxHp) * 100)}%`;

    const timerEl = document.getElementById("game-timer");
    timerEl.innerText =
      this.matchHealth === "unlimited" ? "∞" : Math.ceil(timer);
    timerEl.classList.toggle(
      "low",
      timer < 10 && this.matchHealth !== "unlimited",
    );

    this.renderOrbs("p1-orbs", p1.power, p1.cooldowns.ult);
    this.renderOrbs("cpu-orbs", cpu.power, cpu.cooldowns.ult);
  }

  renderOrbs(id, power, ultCd) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const orb = document.createElement("div");
      orb.className = `orb`;
      const inner = document.createElement("div");
      inner.className = "orb-inner";
      if (power >= i + 1) {
        inner.style.height = "100%";
        orb.style.boxShadow = "0 0 5px var(--cyan)";
      } else if (power > i) {
        inner.style.height = `${(power - i) * 100}%`;
      } else {
        inner.style.height = "0%";
      }
      if (ultCd > 0) inner.style.background = "#555";
      orb.appendChild(inner);
      el.appendChild(orb);
    }
  }

  updateCombo(n) {
    const el = document.getElementById("combo-counter");
    if (n < 2) {
      el.style.opacity = 0;
      return;
    }
    el.innerText = `${n} HIT COMBO!`;
    el.style.opacity = 1;
    el.style.transform = `translateX(-50%) scale(1.2)`;
    setTimeout(() => (el.style.transform = `translateX(-50%) scale(1)`), 100);
  }

  shakeScreen(amt) {
    const arena = document.getElementById("arena");
    arena.style.transform = `translate(${amt}px, ${amt}px)`;
    setTimeout(
      () => (arena.style.transform = `translate(-${amt}px, -${amt}px)`),
      50,
    );
    setTimeout(() => (arena.style.transform = ``), 100);
  }

  togglePause() {
    const paused = engine.togglePause();
    document.getElementById("pause-modal").style.display = paused
      ? "flex"
      : "none";
  }

  handleGameEnd(result, p1, cpu, timer) {
    this.showScreen("result");
    const rt = document.getElementById("result-text");

    if (result === "SURVIVAL_END") {
      rt.innerText = "SURVIVAL OVER";
      rt.style.color = "var(--cyan)";
      document.getElementById("result-char").innerText =
        `${p1.data.name} Defeated ${engine.survivalKills || 0} Enemies!`;

      const score =
        (engine.survivalKills || 0) * 2500 +
        Math.floor((p1.hp / p1.maxHp) * 1000);
      this.animateScore(score);

      const earnedShards = Math.floor(score / 100);
      state.addShards(earnedShards);
      state.addScore({
        name: p1.data.name,
        score,
        date: new Date().toLocaleDateString(),
      });
      return;
    }

    rt.innerText = result;
    rt.style.color =
      result === "VICTORY"
        ? "var(--cyan)"
        : result === "DRAW"
          ? "var(--orange)"
          : "var(--pink)";

    document.getElementById("result-char").innerText =
      `${result === "VICTORY" ? p1.data.name : cpu.data.name} Dominates!`;

    const score = Math.floor(
      (result === "VICTORY" ? 5000 : 0) +
        (p1.hp / p1.maxHp) * 5000 +
        timer * 100,
    );
    this.animateScore(score);

    const earnedShards = Math.floor(score / 100);
    state.addShards(earnedShards);
    state.addScore({
      name: p1.data.name,
      score,
      date: new Date().toLocaleDateString(),
    });
  }

  animateScore(target) {
    let curr = 0;
    const step = Math.ceil(target / 50);
    const interval = setInterval(() => {
      curr += step;
      if (curr >= target) {
        curr = target;
        clearInterval(interval);
      }
      document.getElementById("final-score").innerText = `SCORE: ${curr}`;
    }, 20);
  }

  renderLeaderboard() {
    const scores = state.data.highScores;
    const container = document.getElementById("leaderboard-content");
    if (!scores || scores.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding-top:100px; color:#666; font-style:italic">No battles yet — go fight!</div>`;
      return;
    }
    container.innerHTML = `
            <table style="width:100%; border-collapse:collapse; text-align:left">
                <tr style="border-bottom:1px solid #333; color:#aaa; font-size:0.8rem">
                    <th style="padding:10px">RANK</th><th style="padding:10px">FIGHTER</th><th style="padding:10px">SCORE</th><th style="padding:10px">DATE</th>
                </tr>
                ${scores
                  .map(
                    (s, i) => `
                    <tr style="border-bottom:1px solid #111; ${i < 3 ? `border-left: 4px solid ${i == 0 ? "gold" : i == 1 ? "silver" : "#cd7f32"}` : ""}">
                        <td style="padding:15px">${i + 1}</td>
                        <td style="padding:15px">${s.name}</td>
                        <td style="padding:15px; color:var(--cyan)">${s.score}</td>
                        <td style="padding:15px; font-size:0.8rem">${s.date}</td>
                    </tr>
                `,
                  )
                  .join("")}
            </table>`;
  }

  // --- TITLE PARTICLES ---
  initParticles() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 3,
      color: Math.random() > 0.5 ? "#f97316" : "#22d3ee",
    }));
  }

  drawParticles() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = this.canvas.width;
      if (p.x > this.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.canvas.height;
      if (p.y > this.canvas.height) p.y = 0;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    if (this.activeScreen === "title")
      requestAnimationFrame(() => this.drawParticles());
  }
}

export const ui = new UI();
