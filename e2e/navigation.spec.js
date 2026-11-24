import { test, expect } from "./fixtures.js";

test("the public page explains the controls and opens the game at every screen size", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Anime Legends", level: 1 })).toBeVisible();
  const launch = page.getByRole("link", { name: "Enter the arena" });
  await expect(launch).toBeVisible();
  await expect.poll(() => page.locator(".hero-art img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const guide = page.getByRole("region", { name: "Fight controls" });
  if (isMobile) {
    await guide.scrollIntoViewIfNeeded();
  } else {
    await page.getByRole("link", { name: "Controls", exact: true }).click();
    await expect(page).toHaveURL(/#controls$/);
  }
  await expect(guide.getByRole("heading")).toBeInViewport();
  const controls = guide.getByRole("table", { name: "Keyboard and touchscreen controls" });
  const ultimate = controls.getByRole("row", { name: /Ultimate/ });
  await expect(ultimate.getByRole("cell", { name: "Hold V" })).toBeVisible();
  await expect(ultimate.getByRole("cell", { name: "Hold Power" })).toBeVisible();
  await expect(controls.getByRole("row", { name: /Pause/ })).toContainText("Esc");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Play now" }).click();
  await expect(page.getByRole("button", { name: "Choose fighter" })).toBeVisible();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(launch).toBeVisible();
});

test("the preview delivers the match video and closes cleanly", async ({ page, request, isMobile }) => {
  await page.goto("/");
  const watch = page.getByRole("button", { name: "Watch gameplay" });
  if (isMobile) await watch.tap();
  else await watch.press("Enter");

  const preview = page.getByRole("dialog", { name: "Gameplay preview" });
  await expect(preview).toBeVisible();
  const video = page.locator("video");
  await expect(video).toHaveJSProperty("controls", true);
  const source = await video.evaluate((player) => player.src);
  const response = await request.get(source, { headers: { Range: "bytes=0-31" } });
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("video/mp4");
  expect((await response.body()).subarray(4, 8).toString("ascii")).toBe("ftyp");

  if (isMobile) await preview.getByRole("button", { name: "Close preview" }).tap();
  else await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(video).toHaveJSProperty("paused", true);
  if (!isMobile) await expect(watch).toBeFocused();
});

test("the title menu opens help and returns focus after navigating screens", async ({ page, isMobile }) => {
  await page.goto("/game.html");
  const choose = page.getByRole("button", { name: "Choose fighter" });
  const help = page.getByRole("button", { name: "How to play" });
  const dialog = page.getByRole("dialog", { name: "How to play" });
  if (isMobile) {
    await help.tap();
  } else {
    await page.keyboard.press("Tab");
    await expect(choose).toBeFocused();
    await help.press("Enter");
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  }
  await expect(dialog).toContainText("Hold V");
  if (isMobile) {
    await dialog.getByRole("button", { name: "Close" }).tap();
  } else {
    await page.keyboard.press("Escape");
    await expect(help).toBeFocused();
  }
  await expect(dialog).toBeHidden();

  if (isMobile) await choose.tap();
  else await choose.press("Enter");
  await expect(page.getByRole("heading", { name: "Choose your fighter" })).toBeFocused();
  const back = page.getByRole("button", { name: "Main menu" });
  if (isMobile) {
    await back.tap();
  } else {
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page.getByRole("heading", { name: /Anime\s*Legends/i })).toBeFocused();
});
