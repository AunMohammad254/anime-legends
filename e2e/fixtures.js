import { test as base, expect } from "@playwright/test";

export { expect };

// Watch every tab, including secondary tabs opened by cross-tab save tests.
export const test = base.extend({
  context: async ({ context }, use) => {
    const errors = [];
    context.on("weberror", (event) => errors.push(event.error().message));
    context.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await use(context);
    expect(errors, "Unexpected page errors or HTTP failures").toEqual([]);
  },
});
