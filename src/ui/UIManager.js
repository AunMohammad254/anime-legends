import { CHARACTERS, WEAPON_SKINS, STAT_BOOSTS } from "../../constants.js";
import { state } from "../../state.js";
import { engine } from "../../engine.js";
import { createFighterHTML } from "../entities/Character.js";
import { ScreenManager } from "./ScreenManager.js";
import { HUDRenderer } from "./HUDRenderer.js";

const byId = (id) => document.getElementById(id);

function markChoice(buttons, key, value) {
  for (const button of buttons) {
    const selected = button.dataset[key] === String(value);
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function portrait(fighter) {
  return `<div class="sprite-preview" aria-hidden="true">${createFighterHTML(fighter)}</div>`;
}

export class UIManager {
  constructor() {
    this.selectedChar = null;
    this.cpuChar = null;
    this.difficulty = "normal";
    this.matchHealth = 100;
    this.shopTab = "chars";
    this.screenManager = new ScreenManager(this);
    this.hudRenderer = new HUDRenderer();
  }

  init() {
    this.updateShards(state.spiritShards);
    this.screenManager.init();
    this.setupEngineCallbacks();
    this.selectChar("blaze");
    this.setHealth(this.matchHealth);
    this.setDifficulty(this.difficulty);
    state.on("storageUnavailable", () => {
      if (!this.storageWarningShown) {
        this.storageWarningShown = true;
        this.showToast("Your browser could not save progress. Scores and purchases last for this session.");
      }
    });
    state.on("progressLoaded", () => {
      this.updateShards(state.spiritShards);
      const screen = this.screenManager.activeScreen;
      if (screen === "shop") this.renderShop();
      if (screen === "leaderboard") this.renderLeaderboard();
      if (!state.isUnlocked(this.selectedChar.id)) this.selectChar("blaze");
      else if (screen === "character-select") this.renderCharSelect();
    });
  }

  setupEngineCallbacks() {
    engine.onHUDUpdate = (p1, cpu, timer) => {
      const phase = this.matchHealth === "unlimited" ? `Wave ${engine.survivalKills + 1}` : engine.bossPhase ? "Final boss" : "";
      this.hudRenderer.update(p1, cpu, timer, this.matchHealth, phase);
    };
    engine.onComboUpdate = (n) => this.hudRenderer.updateCombo(n);
    engine.onShake = (amt) => this.hudRenderer.shakeScreen(amt);
    engine.onGameEnd = (result, p1, cpu, timer) => this.handleGameEnd(result, p1, cpu, timer);
  }

  showScreen(id) {
    const target = byId(`screen-${id}`);
    if (!target) return;
    clearTimeout(this.matchupTimeout);
    clearTimeout(this.roundTimeout);
    const pauseDialog = byId("pause-modal");
    if (pauseDialog?.open) pauseDialog.close();
    if (this.screenManager.activeScreen === "battle" && engine.gameActive && id !== "battle") {
      engine.stopBattle();
    }
    if (id === "shop") this.renderShop();
    if (id === "leaderboard") this.renderLeaderboard();
    if (id === "character-select") this.renderCharSelect();
    this.screenManager.showScreen(id);
  }

  renderCharSelect() {
    const grid = byId("char-grid");
    if (!grid) return;
    const previousFocus = grid.contains(document.activeElement) ? document.activeElement.id : null;
    grid.innerHTML = CHARACTERS.map((c) => {
      const selected = this.selectedChar?.id === c.id;
      const owned = state.isUnlocked(c.id);
      return `<button type="button" class="char-card roster-card${selected ? " selected" : ""}" id="fighter-${c.id}"
        aria-pressed="${selected}" style="--char-color:${c.color}" onclick="selectChar('${c.id}')">
        ${portrait(c)}<strong>${c.name}</strong><small>${owned ? c.element : `◆ ${c.price}`}</small>
      </button>`;
    }).join("");
    if (previousFocus) byId(previousFocus)?.focus({ preventScroll: true });

    const c = this.selectedChar;
    if (!c) return;
    const details = byId("char-details-box");
    details.innerHTML = `<div class="fighter-summary">
      <span class="element-name" style="color:${c.color}">${c.element}</span><h3>${c.name}</h3>
      <p><b>Special</b> ${c.special}</p><p><b>Ultimate</b> ${c.ultimate}</p>
    </div><dl class="stat-bars">${[["Attack", c.atk], ["Speed", c.spd], ["Defense", c.def]].map(([name, stat]) =>
      `<div class="stat-row"><dt>${name}</dt><dd><span style="--stat:${stat * 10}%; --char-color:${c.color}"></span><b>${stat}</b></dd></div>`
    ).join("")}</dl>`;
  }

  selectChar(id) {
    const fighter = CHARACTERS.find((c) => c.id === id);
    if (!fighter) return;
    if (!state.isUnlocked(id)) {
      this.shopTab = "chars";
      this.showScreen("shop");
      byId(`shop-${id}`)?.focus();
      return;
    }
    this.selectedChar = fighter;
    const opponents = CHARACTERS.filter((c) => c.id !== id);
    this.cpuChar = opponents[Math.floor(Math.random() * opponents.length)];
    this.renderCharSelect();
    byId("cpu-reveal").textContent = `Opponent · ${this.cpuChar.name}`;
    byId("fight-btn").disabled = false;
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
    markChoice(document.querySelectorAll("[data-difficulty]"), "difficulty", difficulty);
    this.updateMatchRules();
  }

  setHealth(health) {
    this.matchHealth = health;
    markChoice(document.querySelectorAll("[data-health]"), "health", health);
    this.updateMatchRules();
  }

  updateMatchRules() {
    const rules = byId("match-rules");
    if (!rules) return;
    if (this.matchHealth === "unlimited") rules.textContent = "Face stronger waves on one health bar. Pause to finish your run.";
    else if (this.difficulty === "expert") rules.textContent = "Defeat the expert opponent, then face their final boss form.";
    else rules.textContent = "Knock out your opponent or finish with more health.";
  }

  setShopTab(tab) {
    this.shopTab = tab;
    this.renderShop();
  }

  renderShop() {
    const grid = byId("shop-grid");
    const previousFocus = grid.contains(document.activeElement) ? document.activeElement.id : null;
    markChoice(document.querySelectorAll("[data-tab]"), "tab", this.shopTab);
    const note = byId("shop-note");
    if (this.shopTab === "chars") {
      note.textContent = "Unlock fighters with Spirit Shards earned in matches.";
      grid.innerHTML = CHARACTERS.filter((c) => c.price > 0).map((c) => this.shopCard({
        id: c.id, title: c.name, color: c.color, detail: c.element, icon: portrait(c),
        label: state.isUnlocked(c.id) ? "Owned" : `Unlock · ◆ ${c.price}`,
        disabled: state.isUnlocked(c.id), handler: "buyCharacter",
      })).join("");
    } else if (this.shopTab === "skins") {
      note.textContent = "Equip a glow for your weapons.";
      grid.innerHTML = WEAPON_SKINS.map((s) => this.shopCard({
        id: s.id, title: s.name, color: s.color || "#d0e0e4", detail: "Weapon skin", icon: '<span class="shop-symbol" aria-hidden="true">⚔</span>',
        label: state.data.activeSkinId === s.id ? "Equipped" : state.isSkinUnlocked(s.id) ? "Equip" : `Unlock · ◆ ${s.price}`,
        disabled: state.data.activeSkinId === s.id, handler: "buySkin",
      })).join("");
    } else {
      note.textContent = "Unlock boosts once. Equip up to two. A third replaces the oldest.";
      grid.innerHTML = STAT_BOOSTS.map((b) => this.shopCard({
        id: b.id, title: b.name, color: "#ff9253", detail: b.desc, icon: '<span class="shop-symbol" aria-hidden="true">ϟ</span>',
        label: state.isBoostActive(b.id) ? "Unequip" : state.isBoostUnlocked(b.id) ? "Equip" : `Unlock · ◆ ${b.price}`,
        handler: "toggleBoost",
      })).join("");
    }
    if (previousFocus) {
      const newButton = byId(previousFocus);
      (newButton?.disabled ? document.querySelector("[data-tab].active") : newButton)?.focus({ preventScroll: true });
    }
  }

  shopCard({ id, title, color, detail, icon, label, disabled, handler }) {
    return `<article class="char-card shop-card" style="--char-color:${color}">
      ${icon}<h3>${title}</h3><p>${detail}</p>
      <button id="shop-${id}" type="button" class="item-action" ${disabled ? "disabled" : ""} onclick="${handler}('${id}')">${label}</button>
    </article>`;
  }

  buyCharacter(id) {
    const c = CHARACTERS.find((c) => c.id === id);
    if (!c || state.isUnlocked(id)) return;
    if (!state.buyCharacter(id)) return this.showToast("You need more Spirit Shards.", true);
    this.renderShop();
    this.showToast(`${c.name} joined your roster.`);
  }

  buySkin(id) {
    const s = WEAPON_SKINS.find((s) => s.id === id);
    if (!s) return;
    if (!state.buySkin(id)) return this.showToast("You need more Spirit Shards.", true);
    this.renderShop();
    this.showToast(`${s.name} equipped.`);
  }

  toggleBoost(id) {
    const b = STAT_BOOSTS.find((b) => b.id === id);
    if (!b) return;
    if (!state.toggleBoost(id)) return this.showToast("You need more Spirit Shards.", true);
    this.renderShop();
    this.showToast(`${b.name} ${state.isBoostActive(id) ? "equipped" : "unequipped"}.`);
  }

  showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = `toast${isError ? " error" : ""}`;
    toast.textContent = message;
    byId("toast-container").replaceChildren(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  updateShards(shards) {
    document.querySelectorAll("#shard-count, [data-balance]").forEach((el) => {
      el.textContent = String(shards);
    });
  }

  renderLeaderboard() {
    const container = byId("leaderboard-content");
    const scores = state.data.highScores;
    if (!scores.length) {
      container.textContent = "Finish a match to record your first score.";
      return;
    }
    container.innerHTML = "<table><thead><tr><th>Rank</th><th>Fighter</th><th>Score</th><th>Date</th></tr></thead><tbody></tbody></table>";
    const body = container.querySelector("tbody");
    scores.forEach((entry, index) => {
      const row = body.insertRow();
      for (const value of [index + 1, entry.name, entry.score.toLocaleString(), entry.date]) {
        row.insertCell().textContent = String(value);
      }
    });
  }

  preBattleCutscene() {
    if (!this.selectedChar || !this.cpuChar || this.screenManager.activeScreen === "vs") return;
    this.showScreen("vs");
    for (const [id, fighter] of [["vs-p1", this.selectedChar], ["vs-cpu", this.cpuChar]]) {
      const el = byId(id);
      el.style.setProperty("--char-color", fighter.color);
      el.innerHTML = `${portrait(fighter)}<small>${id === "vs-p1" ? "Player" : "CPU"}</small>${fighter.name}`;
    }
    this.matchupTimeout = setTimeout(() => this.initBattle(), 1000);
  }

  initBattle() {
    this.showScreen("battle");
    this.hudRenderer.updateCombo(0);
    byId("end-unlimited-btn").hidden = this.matchHealth !== "unlimited";
    const round = byId("round-text");
    round.textContent = "Fight!";
    round.style.opacity = "1";
    this.roundTimeout = setTimeout(() => { round.style.opacity = "0"; }, 850);
    engine.startBattle(this.selectedChar, this.cpuChar, this.difficulty, this.matchHealth);
  }

  togglePause() {
    if (!engine.gameActive || this.screenManager.activeScreen !== "battle") return;
    const dialog = byId("pause-modal");
    if (engine.togglePause()) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
      byId("screen-battle").focus();
    }
  }

  handleGameEnd(result, p1, cpu, timer) {
    this.showScreen("result");
    const heading = byId("result-text");
    const detail = byId("result-char");
    const survival = result === "SURVIVAL_END";
    heading.textContent = survival ? "Survival over" : result;
    if (survival) {
      const waves = engine.survivalKills;
      detail.textContent = `${p1.data.name} cleared ${waves} ${waves === 1 ? "wave" : "waves"}.`;
    } else if (result === "DRAW") detail.textContent = `${p1.data.name} and ${cpu.data.name} tied.`;
    else detail.textContent = `${result === "VICTORY" ? p1.data.name : cpu.data.name} wins the match.`;
    const damageScore = Math.round(Math.max(0, 1 - cpu.hp / cpu.maxHp) * 1000);
    let score = damageScore;
    if (survival) score += engine.survivalKills * 2500;
    else if (result === "VICTORY") score += 5000 + Math.ceil(p1.hp / p1.maxHp * 3000) + Math.ceil(Math.max(0, timer)) * 50;
    const bestCombo = p1.bestCombo;
    const shards = state.recordBattle({ name: p1.data.name, score, bestCombo, date: new Date().toLocaleDateString() });
    for (const [id, hits] of [["match-combo", bestCombo], ["personal-combo", state.data.bestCombo]]) {
      byId(id).textContent = `${hits} ${hits === 1 ? "hit" : "hits"}`;
    }
    const guards = p1.perfectGuards ?? 0;
    const counters = p1.countersLanded ?? 0;
    byId("perfect-guards").textContent = String(guards);
    byId("counters-landed").textContent = String(counters);
    const insight = byId("rematch-insight");
    if (guards > counters) {
      insight.textContent = "You timed a perfect guard. Next time the guard flashes, tap Light (Z) right away, even while holding Block.";
    } else if (counters > 0) {
      insight.textContent = "Every perfect guard became a counter. Keep watching their heavy windup for the next opening.";
    } else {
      insight.textContent = "On the rematch, watch for a heavy punch. Start blocking just before impact, then tap Light (Z) to counter.";
    }
    byId("final-score").textContent = `${score.toLocaleString()} points`;
    byId("shards-earned").textContent = `+ ${shards} Spirit Shards`;
  }
}
