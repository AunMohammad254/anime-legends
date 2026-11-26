import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager } from "../src/audio/AudioManager.js";

// jsdom has no Web Audio backend. Track the lifetime and automation of the
// sources that AudioManager would hand to the browser's audio output.
class TestAudioContext {
  constructor() {
    this.state = "suspended";
    this.sources = [];
    this.sampleRate = 48000;
    this.destination = {};
  }

  get currentTime() { return performance.now() / 1000; }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }

  createOscillator() {
    const source = {
      frequency: this.createParam(),
      connect() {},
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.sources.push(source);
    return source;
  }

  createBuffer(channels, length, rate) {
    const samples = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => samples };
  }

  createBufferSource() {
    const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn() };
    this.sources.push(source);
    return source;
  }

  createParam() {
    return {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    };
  }

  createGain() { return { gain: this.createParam(), connect() {}, disconnect() {} }; }
  createBiquadFilter() { return { frequency: this.createParam(), connect() {}, disconnect() {} }; }
}

describe("Audio preferences and battle playback", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("AudioContext", TestAudioContext);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("starts muted, remembers the player's choice, and respects it after reload", () => {
    const audio = new AudioManager();
    audio.init();
    audio.playSound("special");
    expect(audio.ctx.sources).toHaveLength(0);
    expect(audio.toggle()).toBe(true);
    const nextSession = new AudioManager();
    nextSession.init();
    expect(nextSession.enabled).toBe(true);
    expect(nextSession.ctx.state).toBe("running");
    expect(nextSession.toggle()).toBe(false);
    nextSession.playSound("ko");
    expect(nextSession.ctx.sources).toHaveLength(0);
    expect(new AudioManager().enabled).toBe(false);
  });

  it("keeps the saved preference when this browser cannot create audio output", () => {
    localStorage.setItem("anime-audio", "true");
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("Device unavailable"); } });
    const audio = new AudioManager();
    audio.init();
    expect(audio.toggle()).toBe(false);
    audio.startBGM();
    audio.playSound("block");
    audio.stopBGM();
    expect(vi.getTimerCount()).toBe(0);
    expect(localStorage.getItem("anime-audio")).toBe("true");
  });

  it("allows sound for the current session when browser storage is disabled", () => {
    const denied = () => { throw new DOMException("Storage disabled", "SecurityError"); };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied);
    const audio = new AudioManager();
    expect(audio.toggle()).toBe(true);
    audio.playSound("ko");
    const tone = audio.ctx.sources.at(-1);
    expect(tone.start).toHaveBeenCalledOnce();
    expect(tone.stop.mock.calls[0][0]).toBeGreaterThan(audio.ctx.currentTime);
    tone.onended();
    expect(tone.disconnect).toHaveBeenCalledOnce();
    expect(audio.toggle()).toBe(false);
  });

  it("keeps a single music track, stops it when paused or muted, and restarts it on request", () => {
    const audio = new AudioManager();
    audio.init();
    audio.startBGM();
    expect(audio.ctx.sources).toHaveLength(0);
    audio.toggle(); // Unmute after the match has begun.
    const firstTrack = [...audio.ctx.sources];
    expect(firstTrack.length).toBeGreaterThan(0);
    audio.startBGM();
    expect(audio.ctx.sources).toHaveLength(firstTrack.length);
    vi.advanceTimersByTime(600);
    const melody = firstTrack.find((source) => source.frequency.setValueAtTime.mock.calls.length > 1);
    expect(melody).toBeDefined();

    audio.stopBGM(); // Pause the match.
    for (const source of firstTrack) expect(source.stop).toHaveBeenCalledOnce();
    const noteCount = melody.frequency.setValueAtTime.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(melody.frequency.setValueAtTime).toHaveBeenCalledTimes(noteCount);

    audio.startBGM(); // Resume the match.
    const resumedTrack = audio.ctx.sources.slice(firstTrack.length);
    expect(resumedTrack).toHaveLength(firstTrack.length);
    audio.toggle(); // Mute while playing.
    for (const source of resumedTrack) expect(source.stop).toHaveBeenCalledOnce();
    audio.stopBGM(); // End the muted match, then enable sound in the menu.
    audio.toggle();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("plays distinct light and heavy impacts with one reusable sample per punch", () => {
    const audio = new AudioManager();
    audio.init();
    audio.playSound("heavy");
    expect(audio.ctx.sources).toHaveLength(0);
    audio.toggle();
    audio.playSound("light");
    audio.playSound("heavy");
    audio.playSound("heavy");
    const [swing, light, heavy, nextHeavy] = audio.ctx.sources;
    expect(swing.frequency).toBeDefined();
    expect(light.buffer).not.toBe(heavy.buffer);
    expect(heavy.buffer.duration).toBeGreaterThan(light.buffer.duration);
    expect(nextHeavy.buffer).toBe(heavy.buffer);
    for (const hit of [light, heavy, nextHeavy]) {
      const samples = hit.buffer.getChannelData(0);
      expect(samples[0]).toBeCloseTo(0);
      expect(samples.at(-1)).toBeCloseTo(0);
      expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
      expect(samples.every((value) => Math.abs(value) <= 1)).toBe(true);
      expect(hit.connect).toHaveBeenCalledWith(audio.ctx.destination);
      expect(hit.start).toHaveBeenCalledOnce();
      hit.onended();
      expect(hit.disconnect).toHaveBeenCalledOnce();
    }
    audio.toggle();
    audio.playSound("light");
    expect(audio.ctx.sources).toHaveLength(4);
  });

  it.each([
    ["swing", 0.1], ["special", 0.5], ["ko", 1.2], ["block", 0.05],
  ])("plays a short %s cue and schedules it to end", (cue, duration) => {
    localStorage.setItem("anime-audio", "true");
    const audio = new AudioManager();
    audio.init();
    audio.playSound(cue);
    const source = audio.ctx.sources.at(-1);
    expect(source.start).toHaveBeenCalledOnce();
    expect(source.stop).toHaveBeenCalledWith(audio.ctx.currentTime + duration);
  });

  it("works with prefixed Web Audio and tolerates asynchronous browser playback restrictions", async () => {
    vi.stubGlobal("AudioContext", undefined);
    class RestrictedAudio extends TestAudioContext {
      async resume() { throw new Error("Gesture needed"); }
      async suspend() { throw new Error("Device interrupted"); }
    }
    vi.stubGlobal("webkitAudioContext", RestrictedAudio);
    localStorage.setItem("anime-audio", "true");
    const audio = new AudioManager();
    audio.init();
    expect(audio.ctx).toBeInstanceOf(RestrictedAudio);
    expect(audio.toggle()).toBe(false);
    expect(audio.toggle()).toBe(true);
    await Promise.resolve();
    expect(localStorage.getItem("anime-audio")).toBe("true");
  });

});
