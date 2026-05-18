/**
 * HUDRenderer.js
 * Handles in-battle HUD elements: health bars, power orbs, timer, and combos.
 */
export class HUDRenderer {
  constructor(ui) {
    this.ui = ui;
  }

  update(p1, cpu, timer, matchHealth) {
    const p1HpFill = document.getElementById("p1-hp-fill");
    const p1HpText = document.getElementById("p1-hp-text");
    const cpuHpFill = document.getElementById("cpu-hp-fill");
    const cpuHpText = document.getElementById("cpu-hp-text");

    if (p1HpFill) p1HpFill.style.transform = `scaleX(${Math.max(0, p1.hp / p1.maxHp)})`;
    if (p1HpText) p1HpText.innerText = `${Math.ceil((p1.hp / p1.maxHp) * 100)}%`;

    if (cpuHpFill) cpuHpFill.style.transform = `scaleX(${Math.max(0, cpu.hp / cpu.maxHp)})`;
    if (cpuHpText) cpuHpText.innerText = `${Math.ceil((cpu.hp / cpu.maxHp) * 100)}%`;

    const timerEl = document.getElementById("game-timer");
    if (timerEl) {
      timerEl.innerText = matchHealth === "unlimited" ? "∞" : Math.ceil(timer);
      timerEl.classList.toggle("low", timer < 10 && matchHealth !== "unlimited");
    }

    this.renderOrbs("p1-orbs", p1.power, p1.cooldowns.ult);
    this.renderOrbs("cpu-orbs", cpu.power, cpu.cooldowns.ult);
  }

  renderOrbs(id, power, ultCd) {
    const el = document.getElementById(id);
    if (!el) return;
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
    if (!el) return;
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
    if (!arena) return;
    arena.style.transform = `translate(${amt}px, ${amt}px)`;
    setTimeout(() => (arena.style.transform = `translate(-${amt}px, -${amt}px)`), 50);
    setTimeout(() => (arena.style.transform = ``), 100);
  }
}
