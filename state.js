/**
 * state.js
 * Proxy for the new GameState module to maintain backward compatibility.
 */
import { GameState } from "./src/core/GameState.js";

export const state = new GameState();
