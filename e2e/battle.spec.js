import { test, expect } from "./fixtures.js";

test("a timed duel freezes on pause, resets on restart, and awards only the completed knockout", async ({ page, isMobile }) => {
  await page.clock.install();
  // A returning player has unlocked the opening power boost. Keep the opponent
  // and its decisions stable while exercising the normal controls and hitboxes.
  await page.addInitScript(() => {
    Math.random = () => 0.1;
    if (!localStorage.getItem("anime_legends_save")) {
      localStorage.setItem("anime_legends_save", JSON.stringify({
        unlockedBoosts: ["power_start"], activeBoosts: ["power_start"],
      }));
    }
  });
  await page.goto("/game.html");
  await page.getByRole("button", { name: "Choose fighter" }).click();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.locator("#fight-btn").click();
  await page.clock.runFor(1050);
  const timer = page.locator("#game-timer");
  const cpuHp = page.locator("#cpu-hp-text");
  const pauseButton = page.getByRole("button", { name: "Pause match" });
  const dialog = page.getByRole("dialog", { name: "Paused" });
  const power = page.locator("#p1-orbs");

  async function attack(key, touchButton) {
    if (isMobile) {
      await page.locator("#touch-controls-portrait").getByRole("button", { name: touchButton }).tap();
    } else {
      await page.keyboard.press(key);
    }
  }

  await expect(timer).toHaveText("60");
  await expect(power).toHaveAttribute("aria-label", "2 of 4 power orbs");
  await attack("v", "Power");
  await page.clock.runFor(1200);
  await expect(cpuHp).not.toHaveText("100%");
  await expect(timer).toHaveText("59");

  await pauseButton.click();
  await expect(dialog).toBeVisible();
  const frozenHp = await cpuHp.textContent();
  const frozenTime = await timer.textContent();
  await page.clock.runFor(2500);
  await expect(cpuHp).toHaveText(frozenHp);
  await expect(timer).toHaveText(frozenTime);

  await dialog.getByRole("button", { name: "Restart match" }).click();
  await expect(dialog).toBeHidden();
  await expect(cpuHp).toHaveText("100%");
  await expect(timer).toHaveText("60");
  await expect(power).toHaveAttribute("aria-label", "2 of 4 power orbs");

  // Two fireballs injure the approaching CPU. Land a heavy hit when it closes
  // the distance, allowing the same input sequence on different arena widths.
  for (let i = 0; i < 2; i++) {
    await attack("v", "Power");
    await page.clock.runFor(1200);
  }
  await expect(cpuHp).not.toHaveText("100%");
  const resultScreen = page.locator("#screen-result");
  for (let i = 0; i < 24 && !await resultScreen.isVisible(); i++) {
    await attack("x", "Heavy");
    await page.clock.runFor(550);
  }
  await expect(page.locator("#result-text")).toHaveText("VICTORY");
  await expect(timer).not.toHaveText("0");
  const reward = Number((await page.locator("#shards-earned").textContent()).match(/\d+/)[0]);
  expect(reward).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Rematch" }).click();
  await page.clock.runFor(1050);
  await pauseButton.click();
  await dialog.getByRole("button", { name: "Main menu" }).click();
  await page.clock.runFor(2200);
  await expect(page.locator("#screen-title")).toBeVisible();
  await expect(page.locator("#shard-count")).toHaveText(String(reward));
  await page.getByRole("button", { name: "Leaderboard" }).click();
  await expect(page.locator("#leaderboard-content tbody tr")).toHaveCount(1);
});
