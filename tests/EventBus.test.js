import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "../src/utils/EventBus.js";

describe("EventBus", () => {
  beforeEach(() => {
    EventBus.clear();
  });

  describe("on and emit", () => {
    it("registers and triggers event listeners", () => {
      let called = false;
      EventBus.on("test", () => {
        called = true;
      });
      EventBus.emit("test");
      expect(called).toBe(true);
    });

    it("passes data to listeners", () => {
      let receivedData = null;
      EventBus.on("test", (data) => {
        receivedData = data;
      });
      EventBus.emit("test", { value: 42 });
      expect(receivedData).toEqual({ value: 42 });
    });

    it("supports multiple listeners", () => {
      let count = 0;
      EventBus.on("test", () => {
        count++;
      });
      EventBus.on("test", () => {
        count++;
      });
      EventBus.emit("test");
      expect(count).toBe(2);
    });
  });

  describe("off", () => {
    it("removes specific listener", () => {
      let count = 0;
      const listener = () => {
        count++;
      };
      EventBus.on("test", listener);
      EventBus.off("test", listener);
      EventBus.emit("test");
      expect(count).toBe(0);
    });
  });

  describe("clear", () => {
    it("removes all listeners", () => {
      let count = 0;
      EventBus.on("test1", () => {
        count++;
      });
      EventBus.on("test2", () => {
        count++;
      });
      EventBus.clear();
      EventBus.emit("test1");
      EventBus.emit("test2");
      expect(count).toBe(0);
    });
  });
});
