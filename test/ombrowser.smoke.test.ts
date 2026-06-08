import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { makeObjectModel, mountInDwc, setConnected, setModel } from "dwc-plugin-test-kit";

import OmBrowser from "../src/OmBrowser.vue";

// OmBrowser is a read-only browser (it sends no G-code), so these are mount/render contract tests:
// it must come up cleanly in both reference mode (disconnected — shows the bundled schema) and live
// mode (connected — walks the object model), and basic interactions must not throw.

function mount() {
  return mountInDwc(OmBrowser);
}

describe("OmBrowser mounts in a DWC-like environment", () => {
  it("renders reference mode when disconnected (bundled schema)", async () => {
    setConnected(false);
    const w = mount();
    await flushPromises();
    expect(w.find(".om-browser").exists()).toBe(true);
    // Status bar reflects the offline/reference state and the toolbar title renders.
    expect(w.text()).toContain("plugins.omBrowser.title");
    expect(w.text()).toContain("plugins.omBrowser.reference");
    // The reference tree is built from the bundled model and has at least the root row.
    expect(w.findAll(".tree-row").length).toBeGreaterThan(0);
    w.unmount();
  });

  it("renders live mode when connected with a model", async () => {
    setConnected(true);
    setModel(makeObjectModel());
    const w = mount();
    await flushPromises();
    expect(w.find(".om-browser").exists()).toBe(true);
    expect(w.text()).toContain("plugins.omBrowser.live");
    // Top-level live keys from the fixture (e.g. "move", "heat") appear as tree rows.
    const labels = w.findAll(".tree-row .tree-name").map((n) => n.text());
    expect(labels).toContain("move");
    w.unmount();
  });

  it("selecting a live tree row shows the detail panel without throwing", async () => {
    setConnected(true);
    setModel(makeObjectModel());
    const w = mount();
    await flushPromises();
    const moveRow = w.findAll(".tree-row").find((r) => r.find(".tree-name").text() === "move");
    expect(moveRow).toBeTruthy();
    await moveRow!.trigger("click");
    await flushPromises();
    // Detail panel switched out of the empty-state prompt into the live property list.
    expect(w.find(".om-detail-list").exists()).toBe(true);
    w.unmount();
  });

  it("typing a search term filters without throwing", async () => {
    setConnected(false);
    const w = mount();
    await flushPromises();
    await w.find("input").setValue("axes");
    // Debounced 250ms; just assert the input took the value and the component is still alive.
    expect((w.find("input").element as HTMLInputElement).value).toBe("axes");
    expect(w.find(".om-browser").exists()).toBe(true);
    w.unmount();
  });
});
