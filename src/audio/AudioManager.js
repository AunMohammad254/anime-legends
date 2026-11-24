export class AudioManager {
  constructor() {
    this.enabled = false;
    try {
      this.enabled = localStorage.getItem("anime-audio") === "true";
    } catch {
      // Browsers can disable persistent storage while still allowing audio.
    }
    this.musicRequested = false;
    this.ctx = null;
    this.bgmNodes = [];
  }

  init() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx && AudioContext) {
      try {
        this.ctx = new AudioContext();
      } catch {
        // Some browsers limit how many contexts a tab may create.
      }
    }
    if (!this.ctx) {
      this.enabled = false;
      return;
    }
    if (this.enabled && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  toggle() {
    this.init();
    if (!this.ctx) return false;
    this.enabled = !this.enabled;
    try {
      localStorage.setItem("anime-audio", String(this.enabled));
    } catch {
      // The current session still honors the player's choice.
    }

    if (this.enabled) {
      this.ctx.resume().catch(() => {});
      if (this.musicRequested) this.startBGM();
      else this.playSound("swing");
    } else {
      this.clearBGM();
      this.ctx.suspend().catch(() => {});
    }
    return this.enabled;
  }

  playSound(type) {
    if (!this.enabled || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    const t = this.ctx.currentTime;

    switch (type) {
      case "light":
        osc.type = "square";
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
        osc.start();
        osc.stop(t + 0.08);
        break;
      case "swing":
        osc.type = "triangle";
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start();
        osc.stop(t + 0.1);
        break;
      case "special":
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(1200, t + 0.5);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.5);
        osc.start();
        osc.stop(t + 0.5);
        break;
      case "ko":
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 1.2);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 1.2);
        osc.start();
        osc.stop(t + 1.2);
        break;
      case "block":
        osc.type = "square";
        osc.frequency.setValueAtTime(300, t);
        gain.gain.setValueAtTime(0.1, t);
        osc.start();
        osc.stop(t + 0.05);
        break;
    }
  }

  startBGM() {
    this.musicRequested = true;
    if (!this.enabled || !this.ctx || this.bgmNodes.length) return;

    const master = this.ctx.createGain();
    master.gain.value = 0.15;
    master.connect(this.ctx.destination);

    const bass = this.ctx.createOscillator();
    bass.type = "sawtooth";
    bass.frequency.value = 55;
    const bFilt = this.ctx.createBiquadFilter();
    bFilt.type = "lowpass";
    bFilt.frequency.value = 800;
    const bGain = this.ctx.createGain();
    bGain.gain.value = 0;
    bass.connect(bFilt);
    bFilt.connect(bGain);
    bGain.connect(master);
    bass.start();
    this.bgmNodes.push(bass);

    const arp = this.ctx.createOscillator();
    arp.type = "triangle";
    const aGain = this.ctx.createGain();
    aGain.gain.value = 0.08;
    arp.connect(aGain);
    aGain.connect(master);
    arp.start();
    this.bgmNodes.push(arp);

    const pat = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0];
    let step = 0;
    const bInt = setInterval(() => {
      if (pat[step % 16]) {
        bGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        bGain.gain.exponentialRampToValueAtTime(
          0.01,
          this.ctx.currentTime + 0.15,
        );
      }
      step++;
    }, 125);

    const aNotes = [220, 277, 330, 415, 440, 415, 330, 277];
    let aStep = 0;
    const aInt = setInterval(() => {
      arp.frequency.setValueAtTime(aNotes[aStep % 8], this.ctx.currentTime);
      aStep++;
    }, 180);

    this.bgmNodes.push({
      stop: () => {
        clearInterval(bInt);
        clearInterval(aInt);
        for (const node of [bass, bFilt, bGain, arp, aGain, master]) node.disconnect();
      },
    });
  }

  stopBGM() {
    this.musicRequested = false;
    this.clearBGM();
  }

  clearBGM() {
    this.bgmNodes.forEach((n) => n.stop());
    this.bgmNodes = [];
  }
}
