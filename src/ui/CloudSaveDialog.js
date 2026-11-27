const STATUS_TEXT = {
  off: "Progress is saved on this device.",
  syncing: "Syncing your progress…",
  saved: "Your cloud backup is up to date.",
  offline: "Cloud save is unavailable. Keep this device’s data and try again when connected.",
  conflict: "This device and the cloud backup both changed. Choose which progress to use.",
  "invalid-code": "That recovery code is invalid. Check the code and try again.",
  "not-found": "No backup was found for that code. Check the code and try again.",
  "storage-error": "Browser storage is unavailable. Keep your recovery code somewhere safe and retry.",
};

const REVIEWS = {
  restore: {
    title: "Replace progress on this device?",
    detail: "Restoring replaces this device’s fighters, shards, and scores with the cloud backup. Check that you have the right recovery code.",
    button: "Replace device progress",
  },
  fork: {
    title: "Create a separate backup?",
    detail: "This device’s progress will use a new recovery code. Save your current code first so you can still access the previous cloud backup.",
    button: "Create separate backup",
  },
  disconnect: {
    title: "Disconnect this device?",
    detail: "Save your recovery code before disconnecting. You can keep playing locally and reconnect with the code later.",
    button: "Confirm disconnect",
  },
};

export function bindCloudSaveDialog(sync) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId("cloud-save");
  const field = byId("cloud-code");
  const entry = byId("cloud-restore-code");
  const notice = byId("cloud-notice");
  const controls = byId("cloud-controls");
  const review = byId("cloud-review");
  const confirm = byId("cloud-confirm");
  let pendingAction;
  let reviewTrigger;

  function reveal(show) {
    field.type = show ? "text" : "password";
    byId("cloud-reveal").textContent = show ? "Hide code" : "Show code";
    byId("cloud-reveal").setAttribute("aria-pressed", String(show));
  }

  function render({ status, code }) {
    byId("cloud-status").textContent = status === "conflict" && !code
      ? "Progress changed on this device during the restore. Review the recovery code and try again."
      : STATUS_TEXT[status];
    byId("cloud-create").hidden = Boolean(code);
    byId("cloud-linked").hidden = !code;
    byId("cloud-conflict").hidden = status !== "conflict" || !code;
    byId("cloud-sync").hidden = status === "conflict";
    for (const button of dialog.querySelectorAll("#cloud-controls button, #cloud-confirm")) {
      button.disabled = status === "syncing";
    }
    field.value = dialog.open && code ? code : "";
  }

  function clearReview() {
    pendingAction = null;
    review.hidden = true;
    controls.hidden = false;
  }

  function ask(kind, trigger, action) {
    const copy = REVIEWS[kind];
    pendingAction = action;
    reviewTrigger = trigger;
    notice.textContent = "";
    byId("cloud-review-title").textContent = copy.title;
    byId("cloud-review-detail").textContent = copy.detail;
    confirm.textContent = copy.button;
    controls.hidden = true;
    review.hidden = false;
    byId("cloud-review-title").focus();
  }

  function askRestore(code, trigger) {
    ask("restore", trigger, async () => {
      if (await sync.restore(code)) entry.value = "";
    });
  }

  byId("open-cloud-save").addEventListener("click", () => {
    dialog.showModal();
    render(sync.view);
  });
  dialog.addEventListener("close", () => {
    clearReview();
    reveal(false);
    field.value = "";
    entry.value = "";
    notice.textContent = "";
  });
  byId("cloud-cancel").addEventListener("click", () => {
    clearReview();
    reviewTrigger.focus();
  });
  confirm.addEventListener("click", () => {
    const action = pendingAction;
    clearReview();
    byId("cloud-status").focus();
    action();
  });
  byId("cloud-create").addEventListener("click", () => sync.enable());
  byId("cloud-sync").addEventListener("click", () => sync.retry());
  byId("cloud-reveal").addEventListener("click", () => reveal(field.type === "password"));
  byId("cloud-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      notice.textContent = "Recovery code copied.";
    } catch {
      if (dialog.open) {
        reveal(true);
        field.focus();
        field.select();
        notice.textContent = "Select Copy from your browser’s menu to save the highlighted code.";
      }
    }
  });
  byId("cloud-restore-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = entry.value.trim();
    if (!code) {
      entry.value = "";
      entry.reportValidity();
      return;
    }
    askRestore(code, event.submitter || entry);
  });
  byId("cloud-use-remote").addEventListener("click", (event) => askRestore(sync.view.code, event.currentTarget));
  byId("cloud-fork").addEventListener("click", (event) => ask("fork", event.currentTarget, () => sync.enable()));
  byId("cloud-disconnect").addEventListener("click", (event) => ask("disconnect", event.currentTarget, () => {
    sync.disconnect();
    notice.textContent = sync.view.status === "off" ? "This device was disconnected." : "";
  }));

  sync.subscribe(render);
}
