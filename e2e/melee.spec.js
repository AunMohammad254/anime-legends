import { test, expect } from "./fixtures.js";

// Playwright's native tap is available on both mobile engines. Chromium also
// exposes native two-finger input through CDP, including sliding a held thumb.
async function movingJab(page, player) {
  const deck = page.locator("#touch-controls-portrait");
  const stick = page.locator("#portrait-joystick-zone");
  const light = deck.locator('[data-key="KeyZ"]');
  const block = deck.locator('[data-key="KeyC"]');
  const session = await page.context().newCDPSession(page);
  const touch = (type, touchPoints) => session.send("Input.dispatchTouchEvent", { type, touchPoints });
  const point = async (locator, id, x = 0.5, y = 0.5) => {
    const box = await locator.boundingBox();
    return { id, x: box.x + box.width * x, y: box.y + box.height * y };
  };

  const move = await point(stick, 1, 0.85, 0.38);
  const start = await player.boundingBox();
  await touch("touchStart", [move]);
  await page.clock.runFor(34);
  await expect(stick).toHaveAttribute("data-horizontal", "right");
  expect(await stick.getAttribute("data-jump")).toBeNull();
  expect((await player.boundingBox()).x).toBeGreaterThan(start.x);

  await touch("touchStart", [move, await point(light, 2)]);
  await page.clock.runFor(34);
  await expect(player).toHaveClass(/attack_light/);
  await expect(light).toHaveClass(/pressed/);
  await touch("touchMove", [move, await point(block, 2)]);
  await expect(light).not.toHaveClass(/pressed/);
  await expect(block).toHaveClass(/pressed/);
  await expect(stick).toHaveAttribute("data-horizontal", "right");
  await touch("touchEnd", []);
  await expect(block).not.toHaveClass(/pressed/);
  expect(await stick.getAttribute("data-horizontal")).toBeNull();
  await session.detach();
}

test("a jab misses at a distance and shows contact when it reaches the opponent", async ({ page, isMobile, browserName }) => {
  // Keep the same opponent and let the Easy CPU approach between the two jabs.
  await page.addInitScript(() => { Math.random = () => 0.1; });
  await page.clock.install();
  await page.goto("/game.html");
  await page.getByRole("button", { name: "Choose fighter" }).click();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
  await page.locator("#fight-btn").click();
  await page.clock.runFor(1050);

  const player = page.locator("#p1-sprite");
  const opponent = page.locator("#cpu-sprite");
  const hp = page.locator("#cpu-hp-text");
  const impact = page.locator("#arena .melee-impact");
  const jab = () => isMobile
    ? page.locator('#touch-controls-portrait [data-key="KeyZ"]').tap()
    : page.keyboard.press("z");

  if (isMobile && browserName === "chromium") {
    await movingJab(page, player);
  } else {
    await jab();
    await page.clock.runFor(34);
    await expect(player).toHaveClass(/attack_light/);
  }
  await page.clock.runFor(160);
  await expect(hp).toHaveText("100%");
  await expect(impact).toBeHidden();

  // The arena scales with the viewport. Measure reach in fighter widths.
  const origin = await player.boundingBox();
  let rival = await opponent.boundingBox();
  for (let i = 0; i < 65 && rival.x - origin.x > origin.width * 1.2; i++) {
    await page.clock.runFor(80);
    rival = await opponent.boundingBox();
  }
  expect(rival.x - origin.x).toBeLessThanOrEqual(origin.width * 1.2);
  await jab();
  for (let i = 0; i < 12 && !await impact.isVisible(); i++) await page.clock.runFor(17);
  await expect(impact).toBeVisible();
  await expect(impact).toHaveAttribute("data-kind", "light");
  await expect(hp).not.toHaveText("100%");
  await expect(opponent).toHaveClass(/hurt/);
  await page.clock.runFor(220);
  await expect(impact).toBeHidden();
});
