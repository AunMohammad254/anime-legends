import { CHARACTERS } from "./constants.js";
import { state } from "./state.js";
import { CloudSave } from "./src/cloud/CloudSave.js";
import { bindCloudSaveDialog } from "./src/ui/CloudSaveDialog.js";
import { ui } from "./ui.js";
import { engine } from "./engine.js";

function startGameApp() {
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  document.body.classList.toggle("mobile-optimized", isTouchDevice);

  state.on("shardsChanged", (shards) => ui.manager.updateShards(shards));
  state.on("characterUnlocked", () => ui.manager.renderCharSelect());

  engine.init();
  ui.init();
  const cloudSave = new CloudSave(state);
  bindCloudSaveDialog(cloudSave);
  cloudSave.start();

  if (import.meta.env.DEV) {
    window.gameDebug = {
      state,
      ui: ui.manager,
      engine,
      addShards: (amount) => state.addShards(amount),
      unlockAll: () => CHARACTERS.forEach(({ id }) => state.unlockCharacter(id)),
    };
  }
}

startGameApp();
