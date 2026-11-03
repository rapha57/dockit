import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  SESSION_KEY,
  TOKEN_KEY,
  loginGateCss,
  loginGateScript,
  syncLoginGate,
} from "@/lib/portal-client-session";

function installDocument() {
  const classes = new Set<string>();
  Object.assign(globalThis, {
    document: {
      documentElement: {
        classList: {
          add: (...names: string[]) => names.forEach((name) => classes.add(name)),
          remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
        },
      },
    },
  });
  return classes;
}

function runGate(storage: Record<string, string> | "throw") {
  const classes = new Set<string>();
  const document = {
    documentElement: {
      classList: {
        add: (name: string) => classes.add(name),
      },
    },
  };
  const sessionStorage = {
    getItem(key: string) {
      if (storage === "throw") throw new Error("blocked");
      return storage[key] ?? null;
    },
  };
  new Function("document", "sessionStorage", loginGateScript())(document, sessionStorage);
  return classes;
}

describe("login gate", () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("keeps the stylesheet rule in sync with the inline style", () => {
    const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
    for (const rule of [
      "html.portal-gate:not(.portal-auth) .portal-shell",
      "html.portal-gate.portal-auth .portal-lock",
    ]) {
      expect(css).toContain(rule);
      expect(loginGateCss).toContain(rule);
    }
  });

  it("hides the catalog until a stored session says otherwise", () => {
    expect([...runGate({})]).toEqual(["portal-gate"]);
    expect([...runGate({ [TOKEN_KEY]: "abc" })]).toEqual(["portal-gate", "portal-auth"]);
    expect([...runGate({ [SESSION_KEY]: "{}" })]).toEqual(["portal-gate", "portal-auth"]);
    expect([...runGate("throw")]).toEqual(["portal-gate"]);
  });

  it("drops the gate once the shell can be shown, and never invents portal-auth", () => {
    const classes = installDocument();
    classes.add("portal-auth");
    syncLoginGate(false, true);
    expect(classes.has("portal-gate")).toBe(true);
    expect(classes.has("portal-auth")).toBe(true);

    syncLoginGate(false, false);
    expect(classes.has("portal-gate")).toBe(true);
    expect(classes.has("portal-auth")).toBe(false);

    syncLoginGate(true, true);
    expect(classes.has("portal-gate")).toBe(false);
    expect(classes.has("portal-auth")).toBe(false);
  });
});
