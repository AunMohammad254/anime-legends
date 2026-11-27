import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import gamePage from "../game.html?raw";
import { bindCloudSaveDialog } from "../src/ui/CloudSaveDialog.js";

const code = "a1".repeat(32);
const byId = id => document.getElementById(id);

describe("Cloud save dialog", () => {
  let sync;
  let notify;
  let dialog;

  function update(status, recoveryCode = code) {
    sync.view = { status, code: recoveryCode };
    notify(sync.view);
  }

  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(gamePage, "text/html").body.innerHTML;
    dialog = byId("cloud-save");
    dialog.showModal = () => { dialog.open = true; };
    sync = {
      view: { status: "off", code: "" },
      subscribe(callback) { notify = callback; callback(this.view); },
      enable: vi.fn(), retry: vi.fn(), restore: vi.fn(), disconnect: vi.fn(),
    };
    bindCloudSaveDialog(sync);
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("shows live sync status and only reveals a recovery code inside the open dialog", () => {
    byId("open-cloud-save").click();
    byId("cloud-create").click();
    expect(sync.enable).toHaveBeenCalledOnce();
    update("syncing");
    expect(byId("cloud-confirm").disabled).toBe(true);
    update("saved");
    expect(byId("cloud-create").hidden).toBe(true);
    expect(byId("cloud-code").value).toBe(code);
    byId("cloud-reveal").click();
    expect(byId("cloud-code").type).toBe("text");
    byId("cloud-reveal").click();
    expect(byId("cloud-code").type).toBe("password");
    byId("cloud-sync").click();
    expect(sync.retry).toHaveBeenCalledOnce();
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
    update("offline");
    expect(byId("cloud-code").value).toBe("");
    byId("open-cloud-save").click();
    expect(byId("cloud-code").value).toBe(code);
    expect(byId("cloud-code").type).toBe("password");
  });

  it("copies the code and offers a manual selection when clipboard access fails", async () => {
    const copy = vi.fn().mockResolvedValueOnce().mockRejectedValue(new Error("Clipboard unavailable"));
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    update("saved");
    byId("open-cloud-save").click();
    byId("cloud-copy").click();
    await vi.waitFor(() => expect(byId("cloud-notice").textContent).toBe("Recovery code copied."));
    expect(copy).toHaveBeenCalledWith(code);
    byId("cloud-copy").click();
    await vi.waitFor(() => expect(byId("cloud-code").type).toBe("text"));
    expect(byId("cloud-code").selectionEnd).toBe(code.length);
    byId("cloud-copy").click();
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
    await Promise.resolve();
    expect(byId("cloud-code").value).toBe("");
    expect(byId("cloud-code").type).toBe("password");
  });

  it("requires review before a restore, and keeps the typed code if restoring fails", async () => {
    byId("open-cloud-save").click();
    const form = byId("cloud-restore-form");
    const entry = byId("cloud-restore-code");
    const button = form.querySelector("button");
    entry.value = "  ";
    form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
    expect(entry.value).toBe("");
    expect(byId("cloud-review").hidden).toBe(true);
    entry.value = code;
    form.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
    expect(byId("cloud-review-title").textContent).toContain("Replace");
    byId("cloud-cancel").click();
    expect(document.activeElement).toBe(entry);
    expect(sync.restore).not.toHaveBeenCalled();
    const submit = () => form.dispatchEvent(new SubmitEvent("submit", { submitter: button, cancelable: true }));
    submit();
    byId("cloud-cancel").click();
    expect(document.activeElement).toBe(button);
    sync.restore.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    submit();
    byId("cloud-confirm").click();
    await Promise.resolve();
    expect(entry.value).toBe(code);
    submit();
    byId("cloud-confirm").click();
    await vi.waitFor(() => expect(entry.value).toBe(""));
    expect(sync.restore).toHaveBeenCalledWith(code);
  });

  it("reviews both conflict choices and reports a disconnect only if it succeeds", () => {
    byId("open-cloud-save").click();
    update("conflict", "");
    expect(byId("cloud-conflict").hidden).toBe(true);
    expect(byId("cloud-status").textContent).toContain("during the restore");
    update("conflict");
    expect(byId("cloud-sync").hidden).toBe(true);
    byId("cloud-use-remote").click();
    byId("cloud-confirm").click();
    expect(sync.restore).toHaveBeenCalledWith(code);
    byId("cloud-fork").click();
    expect(byId("cloud-review-title").textContent).toContain("separate");
    byId("cloud-confirm").click();
    expect(sync.enable).toHaveBeenCalledOnce();
    sync.disconnect.mockImplementationOnce(() => update("storage-error"))
      .mockImplementationOnce(() => update("off", ""));
    byId("cloud-disconnect").click();
    byId("cloud-confirm").click();
    expect(byId("cloud-notice").textContent).toBe("");
    byId("cloud-disconnect").click();
    byId("cloud-confirm").click();
    expect(byId("cloud-notice").textContent).toContain("disconnected");
  });
});
