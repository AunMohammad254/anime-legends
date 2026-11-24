import { test, expect } from "./fixtures.js";

test("a player with browser storage blocked can finish a match and see this session's score", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("Storage blocked", "SecurityError"); },
    });
  });
  await page.goto("/game.html");
  await page.getByRole("button", { name: "Choose fighter" }).click();
  await page.getByRole("button", { name: /Survival/ }).click();
  await page.locator("#fight-btn").click();
  await page.getByRole("button", { name: "Pause match" }).click();
  await page.getByRole("button", { name: "Finish survival" }).click();

  await expect(page.getByRole("heading", { name: "Survival over" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Scores and purchases last for this session.");
  await page.getByRole("button", { name: "Main menu" }).click();
  await page.getByRole("button", { name: "Leaderboard" }).click();
  await expect(page.getByRole("cell", { name: "Blaze Warrior" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Leaderboard" }).click();
  await expect(page.locator("#leaderboard-content")).toHaveText("Finish a match to record your first score.");
});

test("two shops preserve the usable fields of a damaged save and share purchases across tabs", async ({ page, context }) => {
  await page.goto("/game.html");
  await page.evaluate(() => localStorage.setItem("anime_legends_save", JSON.stringify({
    spiritShards: 800,
    unlockedCharacters: null,
    unlockedSkins: "gold",
    activeSkinId: "missing",
    highScores: [null, { score: -20 }],
  })));
  await page.reload();
  await page.getByRole("button", { name: "Spirit shop" }).click();
  await page.getByRole("button", { name: "Weapon skins" }).click();
  await expect(page.locator("#shop-default")).toHaveText("Equipped");

  const other = await context.newPage();
  await other.goto("/game.html");
  await other.getByRole("button", { name: "Spirit shop" }).click();
  await page.locator("#shop-gold").click();
  await expect(other.locator("[data-balance]")).toHaveText("500");
  await other.locator("#shop-storm").click();
  await expect(other.getByRole("status")).toContainText("You need more Spirit Shards.");
  await other.locator("#shop-shadow").click();
  await expect(page.locator("[data-balance]")).toHaveText("0");
  await page.getByRole("button", { name: "Fighters", exact: true }).click();
  await expect(page.locator("#shop-shadow")).toBeDisabled();
  await expect(page.locator("#shop-storm")).toBeEnabled();

  await page.reload();
  await page.getByRole("button", { name: "Spirit shop" }).click();
  await expect(page.locator("#shop-shadow")).toHaveText("Owned");
  await page.getByRole("button", { name: "Weapon skins" }).click();
  await expect(page.locator("#shop-gold")).toHaveText("Equipped");
  await expect(page.locator("[data-balance]")).toHaveText("0");
});
