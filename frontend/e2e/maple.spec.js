// End-to-end smoke tests for both Maple Ledger web apps, driven against the
// running dev servers (purchaser :5173, supplier :5174) and the live backend
// (:8000). Asserts the demo-critical flows actually render the right verdicts.
import { test, expect } from "@playwright/test";

const PURCHASER = "http://localhost:5173";
const SUPPLIER = "http://localhost:5174";

test.describe("Purchaser — verify origin", () => {
  test("worked example verifies as Made in Canada / intact", async ({ page }) => {
    await page.goto(`${PURCHASER}/#verify-product`);
    await expect(page.getByRole("heading", { name: "Verify origin" })).toBeVisible();

    await page.getByRole("button", { name: /load worked example/i }).click();

    // Real /verify round-trip → headline verdict.
    await expect(page.getByText("Made in Canada", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Valid", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/58\.4\s*%/)).toBeVisible();
  });

  test("tampered example is flagged: Not Qualified / compromised + parent_hash_mismatch", async ({ page }) => {
    await page.goto(`${PURCHASER}/#verify-product`);
    await page.getByRole("button", { name: /load tampered example/i }).click();

    await expect(page.getByText("Not Qualified", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Invalid", { exact: true }).first()).toBeVisible();
    // The anomaly list humanizes the type: parent_hash_mismatch → "Parent hash mismatch".
    await expect(page.getByText(/parent hash mismatch/i).first()).toBeVisible();
  });

  test("paste-chain JSON path verifies", async ({ page }) => {
    await page.goto(`${PURCHASER}/#verify-product`);
    const chain = JSON.stringify({
      product_attestation_id: "att-anchor-0001",
      attestations: [
        {
          attestation_id: "att-anchor-0001",
          version: "1.0",
          supplier_id: "sup-porcher",
          timestamp: "2026-03-06T09:00:00Z",
          action_type: "raw_material_supply",
          performed_in_country: "FR",
          parents: [],
          output: { name: "PN9 Ripstop Fabric", quantity_produced: 8.0, unit: "m2" },
          costs: { material_cad: 360.0, labour_hours: 0.0, labour_cost_cad: 0.0 },
          signature: {
            algorithm: "ed25519",
            value:
              "DdFl42bZO0UxXeQiH4RZtyaIjmuboJd11r7cgX2nn+O8esEizeE2TGtm0y9KKTGHZ6oNGs5Jx+zfpqbowZCRDQ==",
          },
        },
      ],
    });
    await page.locator("#ml-chain-json").fill(chain);
    await page.getByRole("button", { name: "verify", exact: true }).click();
    // A single FR raw-material node → Not Qualified, but it should render a verdict.
    await expect(page.getByText("Designation", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Supplier — author & sign", () => {
  test("default form signs and issues an attestation with QR + download", async ({ page }) => {
    await page.goto(SUPPLIER);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: /create attestation/i }).click();

    // Step 1: form is pre-filled with the parachute component example → review.
    await page.getByRole("button", { name: /review .*sign/i }).click();

    // Step 2: confirm → sign & submit.
    await expect(page.getByText(/confirm before signing/i)).toBeVisible();
    await page.getByRole("button", { name: /sign .*submit/i }).click();

    // Step 3: issued (or signed-locally if backend down) — content hash + share actions.
    await expect(page.getByText(/content hash/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /download json/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /generate qr/i })).toBeVisible();

    // QR renders a canvas when toggled.
    await page.getByRole("button", { name: /generate qr/i }).click();
    await expect(page.locator("canvas")).toBeVisible();
  });
});
