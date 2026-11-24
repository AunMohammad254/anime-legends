import { afterEach, expect, it, vi } from "vitest";
import landingPage from "../index.html?raw";

afterEach(() => vi.restoreAllMocks());

it.each([true, false])("opens and resets the preview when playback is permitted: %s", async (allowed) => {
  vi.resetModules();
  document.body.innerHTML = new DOMParser().parseFromString(landingPage, "text/html").body.innerHTML;
  const dialog = document.getElementById("gameplay");
  // jsdom supplies the dialog element, while the modal methods are browser APIs.
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => {
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
  };
  const video = dialog.querySelector("video");
  const play = vi.spyOn(video, "play");
  if (allowed) play.mockResolvedValue();
  else play.mockRejectedValue(new DOMException("User activation required", "NotAllowedError"));
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  await import("../landing.js");

  document.getElementById("watch").click();
  await Promise.resolve();
  expect(dialog.open).toBe(true);
  expect(play).toHaveBeenCalledOnce();
  video.click();
  expect(dialog.open).toBe(true);
  video.currentTime = 5;
  dialog.click();
  expect(dialog.open).toBe(false);
  await vi.waitFor(() => expect(pause).toHaveBeenCalledOnce());
  expect(video.currentTime).toBe(0);
});
