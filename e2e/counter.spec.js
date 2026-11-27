import { test, expect } from "./fixtures.js";

test("a timed block stops a heavy and opens a light counter", async ({ page, isMobile }) => {
  // Keep the opponent and its first attack deterministic; both fighters still use the real simulation.
  await page.addInitScript(() => { Math.random = () => 0.66; });
  await page.clock.install();
  await page.goto("/game.html");
  await page.getByRole("button", { name: "Choose fighter" }).click();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.locator("#fight-btn").click();
  await page.clock.runFor(1050);

  const windup = page.locator('#cpu-sprite.attack_heavy[data-strike-phase="STARTUP"]');
  const cue = page.locator("#guard-cue");
  for (let i = 0; i < 80 && !await windup.isVisible(); i++) await page.clock.runFor(80);
  await expect(windup).toBeVisible();
  await expect(cue).toContainText(/heavy windup/i);

  // Advance until the visible arm has coiled most of the way back, then use the player's controls.
  const coil = () => windup.evaluate(el => Number(el.style.getPropertyValue("--windup")));
  for (let i = 0; i < 18 && await coil() < 0.75; i++) await page.clock.runFor(17);
  const deck = page.locator("#touch-controls-portrait");
  if (isMobile) await deck.getByRole("button", { name: "Block", exact: true }).tap();
  else await page.keyboard.down("c");
  await page.clock.runFor(90);
  await expect(cue).toContainText(/perfect guard/i);
  await expect(page.locator("#p1-hp-text")).toHaveText("100%");
  await expect(page.locator(".melee-impact")).toHaveAttribute("data-kind", "perfect");

  if (isMobile) await deck.getByRole("button", { name: "Light", exact: true }).tap();
  else {
    await page.keyboard.press("z");
    await page.keyboard.up("c");
  }
  await page.clock.runFor(135);
  await expect(cue).toHaveText(/counter hit/i);
  await expect(page.locator("#cpu-hp-text")).not.toHaveText("100%");
  await expect(page.locator(".melee-impact")).toHaveAttribute("data-kind", "counter");
});
