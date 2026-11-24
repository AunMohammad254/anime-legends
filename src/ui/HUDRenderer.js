function setText(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

export class HUDRenderer {
  update(p1, cpu, timer, matchHealth, phase = "") {
    this.updateFighter("p1", p1);
    this.updateFighter("cpu", cpu);
    const unlimited = matchHealth === "unlimited";
    setText("game-timer", unlimited ? "∞" : String(Math.max(0, Math.ceil(timer))));
    document.getElementById("game-timer")?.classList.toggle("low", !unlimited && timer < 10);
    setText("round-label", phase);
  }

  updateFighter(id, fighter) {
    const hp = Math.max(0, Math.min(1, fighter.hp / fighter.maxHp));
    const fill = `scaleX(${hp.toFixed(3)})`;
    for (const suffix of ["hp-fill", "hp-ghost"]) {
      const bar = document.getElementById(`${id}-${suffix}`);
      if (bar && bar.style.transform !== fill) bar.style.transform = fill;
    }
    setText(`${id}-name`, fighter.data.name);
    setText(`${id}-hp-text`, `${Math.ceil(hp * 100)}%`);
    const weapon = fighter.weapon;
    setText(`${id}-weapon`, weapon ? `${weapon.name} · ${Math.ceil(weapon.dur)}s` : "");
    this.renderOrbs(`${id}-orbs`, fighter.power, fighter.cooldowns.ult);
  }

  renderOrbs(id, power, ultCd) {
    const el = document.getElementById(id);
    if (!el) return;
    const level = Math.round(power * 100);
    const key = `${level}/${ultCd > 0}`;
    if (el.dataset.level === key) return;
    el.dataset.level = key;
    if (!el.firstElementChild) {
      for (let i = 0; i < 4; i++) {
        const orb = document.createElement("span");
        orb.className = "orb";
        const inner = document.createElement("span");
        inner.className = "orb-inner";
        orb.append(inner);
        el.append(orb);
      }
    }
    Array.from(el.children).forEach((orb, i) => {
      orb.firstElementChild.style.height = `${Math.max(0, Math.min(100, level - i * 100))}%`;
    });
    el.classList.toggle("on-cooldown", ultCd > 0);
    el.setAttribute("aria-label", `${Math.floor(power)} of 4 power orbs`);
  }

  updateCombo(n) {
    const el = document.getElementById("combo-counter");
    if (!el) return;
    clearTimeout(this.comboTimeout);
    el.style.opacity = n < 2 ? "0" : "1";
    if (n >= 2) {
      el.textContent = `${n} hit combo!`;
      this.comboTimeout = setTimeout(() => { el.style.opacity = "0"; }, 900);
    }
  }

  shakeScreen(amt) {
    const arena = document.getElementById("arena");
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const offset = Math.min(5, amt);
    arena?.animate?.([
      { transform: `translateX(${offset}px)` },
      { transform: `translateX(-${offset}px)` },
      { transform: "translateX(0)" },
    ], 100);
  }
}
