import { describe, expect, it } from "vitest";
import { isValidProgress } from "../src/cloud/progressSchema.js";
import { GameState } from "../src/core/GameState.js";

function progress() {
  localStorage.clear();
  return new GameState().data;
}

describe("cloud snapshot compatibility", () => {
  it("accepts a new save and exactly preserves valid Unicode, legacy dates, and equipped items", () => {
    const value = progress();
    expect(isValidProgress(value)).toBe(true);
    Object.assign(value, {
      spiritShards: Number.MAX_SAFE_INTEGER, bestCombo: 3,
      unlockedCharacters: ["blaze", "shadow"], unlockedSkins: ["default", "gold"],
      activeSkinId: "gold", unlockedBoosts: ["hp_up", "power_start"], activeBoosts: ["power_start"],
      highScores: [{ name: "霜❄️🐉", score: 0, date: "۲۰۲۶/۱۱/۲۶" }, {name: "Blaze", score: 25, date: ""}],
    });
    const copy = structuredClone(value);
    expect(isValidProgress(value)).toBe(true);
    expect(value).toEqual(copy);
  });

  it.each([
    ["invalid amounts", { spiritShards: -1 }], ["invalid combo", {bestCombo: 0.2}],
    ["unknown field", { legacy: 12 }], ["missing default fighter", {unlockedCharacters:["shadow"]}],
    ["non-array list", { unlockedCharacters: null }], ["duplicate fighter", { unlockedCharacters: ["blaze","blaze"] }],
    ["unknown fighter", { unlockedCharacters: ["blaze", "other"] }], ["excessive list", {unlockedBoosts:Array(4).fill("hp_up")}],
    ["invalid skins", {unlockedSkins: null}], ["missing default skin", {unlockedSkins: ["gold"]}],
    ["locked equipped skin", { activeSkinId:"gold" }], ["unowned boost", {activeBoosts:["hp_up"]}],
    ["too many active boosts", {unlockedBoosts:["hp_up","power_start","speed_up"],activeBoosts:["hp_up","power_start","speed_up"]}],
    ["non-array scores", {highScores:{}}], ["too many scores", {highScores:Array(11).fill({})}],
  ])("rejects %s", (_reason, change) => {
    expect(isValidProgress({...progress(), ...change})).toBe(false);
  });

  it.each([
    [{name:"\u0000",date:"",score:0}], [{name:"test",date:"\ud800",score:0}],
    [{name:" ",date:"",score:0}], [{name:123,date:"",score:0}],
    [{name:"test",date:"",score:-1}], [{name:"test",date:"x".repeat(129),score:0}],
    [null], [[]], [17], [{name:"test",date:"",unexpected:true}],
  ])("rejects an invalid score entry", (entry) => {
    expect(isValidProgress({...progress(),highScores:[entry]})).toBe(false);
  });
});
