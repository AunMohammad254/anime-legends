import { GameState } from "./src/core/GameState.js";

export const state = new GameState();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === state.storageKey || event.key === null) state.load();
  });
}
