import { test, expect } from "./fixtures.js";

const saveKey = "anime_legends_save";

async function openCloud(page) {
  await page.getByRole("button", { name: "Cloud save", exact: true }).click();
  return page.getByRole("dialog", { name: "Cloud save", exact: true });
}

async function seedReturningPlayer(page) {
  await page.goto("/game.html");
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
    spiritShards: 800,
    bestCombo: 5,
    highScores: [{ name: "Blaze Warrior", score: 2500, date: "11/27/2026" }],
  })), saveKey);
  await page.reload();
}

test("backs up a returning player, saves a purchase, and restores it on a fresh device", async ({ page, browser }) => {
  test.skip(!process.env.TEST_DATABASE_URL, "This playthrough uses a disposable PostgreSQL database.");
  await seedReturningPlayer(page);
  const dialog = await openCloud(page);
  await dialog.getByRole("button", { name: "Create cloud backup" }).click();
  await expect(dialog.locator("#cloud-status")).toHaveText("Your cloud backup is up to date.");
  const code = await dialog.getByLabel("Your recovery code").inputValue();
  expect(code).toMatch(/^[0-9a-f]{64}$/);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Spirit shop" }).click();
  const written = page.waitForResponse(res => res.url().endsWith("/api/progress")
    && res.request().postDataJSON().action === "write" && res.ok());
  await page.locator("#shop-shadow").click();
  await written;
  await expect(page.locator("[data-balance]")).toHaveText("300");

  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    await other.goto(page.url());
    await expect(other.locator("#shard-count")).toHaveText("0");
    const restore = await openCloud(other);
    await restore.getByLabel("Enter a recovery code").fill(code);
    await restore.getByRole("button", { name: "Review restore" }).click();
    await expect(restore.getByRole("heading", { name: "Replace progress on this device?" })).toBeVisible();
    await restore.getByRole("button", { name: "Replace device progress" }).click();
    await expect(restore.locator("#cloud-status")).toHaveText("Your cloud backup is up to date.");
    await other.reload();
    await expect(other.locator("#shard-count")).toHaveText("300");
    await other.getByRole("button", { name: "Spirit shop" }).click();
    await expect(other.locator("#shop-shadow")).toHaveText("Owned");
    const recovered = await other.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
    expect(recovered.bestCombo).toBe(5);
    expect(recovered.highScores[0].score).toBe(2500);
  } finally {
    await fresh.close();
  }
});

test("a cancelled or interrupted restore leaves the existing device save usable", async ({ page }) => {
  await seedReturningPlayer(page);
  const original = await page.evaluate(key => localStorage.getItem(key), saveKey);
  const dialog = await openCloud(page);
  await dialog.getByLabel("Enter a recovery code").fill("a1".repeat(32));
  await dialog.getByRole("button", { name: "Review restore" }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.route("**/api/progress", route => route.abort());
  await dialog.getByRole("button", { name: "Review restore" }).click();
  await dialog.getByRole("button", { name: "Replace device progress" }).click();
  await expect(dialog.locator("#cloud-status")).toContainText("unavailable");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#shard-count")).toHaveText("800");
  expect(await page.evaluate(key => localStorage.getItem(key), saveKey)).toBe(original);
});
