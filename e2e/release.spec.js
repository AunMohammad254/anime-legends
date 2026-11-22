import { test as base, expect } from "@playwright/test";

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await use(page);
    expect(errors).toEqual([]);
  },
});

test("a new player can fight, pause, finish survival and find the result after reloading", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Enter the arena" }).click();
  await page.getByRole("button", { name: "Choose fighter" }).click();
  await expect(page.locator("#char-grid button")).toHaveCount(10);
  await page.getByRole("button", { name: /Survival/ }).click();
  await page.locator("#fight-btn").click();
  await expect(page.locator("#game-timer")).toHaveText("∞");
  const player = page.locator("#p1-sprite");
  const initialX = await player.evaluate((el) => el.offsetLeft);

  if (isMobile) {
    const dash = page.locator("#touch-controls-portrait").getByRole("button", { name: "Dash" });
    await dash.tap();
  } else {
    await page.keyboard.press("Space");
  }
  await expect.poll(() => player.evaluate((el) => el.offsetLeft)).toBeGreaterThan(initialX + 5);

  if (isMobile) await page.getByRole("button", { name: "Pause match" }).tap();
  else await page.keyboard.press("Escape");
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  await pause.getByRole("button", { name: "Resume" }).click();
  await expect(pause).toBeHidden();
  await page.getByRole("button", { name: "Pause match" }).click();
  await pause.getByRole("button", { name: "Finish survival" }).click();
  await expect(page.locator("#result-text")).toHaveText("Survival over");
  await expect(page.locator("#shards-earned")).toContainText("Spirit Shards");

  await page.getByRole("button", { name: "Rematch" }).click();
  await expect(page.getByRole("button", { name: "Pause match" })).toBeVisible();
  await page.getByRole("button", { name: "Pause match" }).click();
  await pause.getByRole("button", { name: "Main menu" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Leaderboard" }).click();
  await expect(page.locator("#leaderboard-content tbody tr")).toHaveCount(1);
  await expect(page.locator("#leaderboard-content tbody")).toContainText("Blaze Warrior");
});

test("a returning player can buy a fighter and boost, then use both after reload", async ({ page }) => {
  await page.goto("/game.html");
  await page.evaluate(() => localStorage.setItem("anime_legends_save", JSON.stringify({
    spiritShards: 850,
    unlockedCharacters: ["blaze"],
  })));
  await page.reload();
  await page.getByRole("button", { name: "Spirit shop" }).click();
  await page.locator("#shop-shadow").click();
  await expect(page.locator("#shop-shadow")).toBeDisabled();
  await page.getByRole("button", { name: "Boosts" }).click();
  await page.locator("#shop-power_start").click();
  await expect(page.locator("#shop-power_start")).toHaveText("Unequip");
  await page.reload();
  await expect(page.locator("#shard-count")).toHaveText("0");
  await page.getByRole("button", { name: "Choose fighter" }).click();
  await page.locator("#fighter-shadow").click();
  await page.locator("#fight-btn").click();
  await expect(page.locator("#p1-name")).toHaveText("Shadow Ninja");
  await expect(page.locator("#p1-orbs")).toHaveAttribute("aria-label", "2 of 4 power orbs");
});
