import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("login, catalog and settings pane", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning")
      pageErrors.push(`${msg.type()}: ${msg.text()}`);
  });

  const health = await page.request.get("/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual({ ok: true });

  await page.goto("/");
  await expect(page.locator(".dockit-mark")).toBeVisible();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Favorites", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toHaveClass(/is-on/);
  await expect(page.getByRole("button", { name: "Lab" })).not.toHaveClass(/is-on/);
  await expect(page.getByText("Grafana")).toBeVisible();
  await expect(page.getByText("Wiki")).toHaveCount(0);

  const account = page.getByRole("button", { name: "Account" });
  await account.click();
  await page.locator(".account-panel").getByRole("menuitem", { name: "Export bookmarks" }).click();
  await expect(page.getByText("https://grafana.example")).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export HTML" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("dockit-bookmarks.html");
  const html = await readFile((await file.path()) as string, "utf8");
  expect(html).toContain("NETSCAPE-Bookmark-file-1");
  expect(html).toContain("https://grafana.example");
  await expect(page.getByRole("button", { name: "Export HTML" })).toHaveCount(0);

  await account.click();
  const signIn = page.locator(".account-panel").getByRole("menuitem", { name: "Sign in" });
  await expect(signIn, pageErrors.join("\n") || "account menu should open").toBeVisible();
  await signIn.click();

  await page.locator('input[autocomplete="username"]').fill("admin");
  await page.locator('input[autocomplete="current-password"]').fill("admin");
  const domain = page.locator("select").filter({ hasText: "Local" });
  if (await domain.count()) await domain.first().selectOption("local");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator('input[autocomplete="username"]')).toHaveCount(0);
  await expect(page.getByText("Home").first()).toBeVisible();
  await expect(page.getByText("Grafana")).toBeVisible();

  await page.getByRole("button", { name: "Lab" }).click();
  await expect(page.getByRole("button", { name: "Lab" })).toHaveClass(/is-on/);
  await page.reload();
  await expect(page.locator(".dockit-mark")).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toHaveClass(/is-on/);
  await expect(page.getByText("Grafana")).toBeVisible();

  await page.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("checkbox", { name: "Open favorites on load" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Reopen last space" })).toHaveCount(0);
  await page.locator(".account-panel").getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.locator(".settings-frame")).toBeVisible();
  await expect(page.locator(".settings-pane")).toBeVisible();

  await page.locator(".settings-nav").getByRole("button", { name: "Presentation" }).click();
  const restore = page
    .locator(".settings-pane")
    .getByRole("checkbox", { name: "Reopen last space" });
  await expect(restore).toBeVisible();
  await expect(restore).not.toBeChecked();

  await page.locator(".settings-nav").getByRole("button", { name: "Security" }).click();
  const httpOnly = page
    .locator(".settings-pane")
    .getByRole("checkbox", { name: "HttpOnly cookie (not sessionStorage)" });
  await expect(httpOnly).toBeVisible();
  await expect(httpOnly).toBeEnabled();
  await page.locator(".settings-frame").getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".settings-frame")).toHaveCount(0);

  await page.getByRole("button", { name: "Account" }).click();
  await page.locator(".account-panel").getByRole("menuitem", { name: "Access" }).click();
  await expect(page.locator(".settings-frame.is-access")).toBeVisible();
  const seeAs = page.getByLabel("View as");
  await expect(seeAs).toBeVisible();
  await seeAs.selectOption({ value: "admin" });
  await expect(
    page.getByText("Change the administrator password before using the portal."),
  ).toBeVisible();
});
