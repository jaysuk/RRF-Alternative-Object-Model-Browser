import { beforeEach, describe, expect, it } from "vitest";
import { loadObjectModel } from "dwc-plugin-test-kit";

import {
	buildReport,
	clearErrors,
	getErrors,
	recordError,
	reportToJson,
	sanitizeModel,
} from "../src/diagnostics";

// Covers the vendored diagnostics module (byte-identical to FlexibleLayouts' copy) so OmBrowser's own
// build/coverage exercise it too.
describe("diagnostics report", () => {
	beforeEach(() => clearErrors());

	it("records errors into a capped ring buffer", () => {
		for (let i = 0; i < 30; i++) recordError("test", new Error(`e${i}`));
		const errs = getErrors();
		expect(errs.length).toBe(25);
		expect(errs[errs.length - 1].message).toBe("e29");
		expect(errs[0].message).toBe("e5");
	});

	it("scrubs network details, serials and file names but keeps structure", () => {
		const model = loadObjectModel({
			network: { hostname: "duet3", interfaces: [{ actualIP: "192.168.1.50", mac: "AA:BB", ssid: "Home", state: "active" }] },
			boards: [{ uniqueId: "SECRET", firmwareVersion: "3.7.0", firmwareName: "RRF" }],
			job: { lastFileName: "0:/gcodes/private.gcode", file: { fileName: "0:/gcodes/private.gcode" } },
			state: { status: "idle" },
		}, { mapGlobals: false });
		const clean = sanitizeModel(model) as any;
		expect(clean.network.hostname).toBe("<redacted>");
		expect(clean.network.interfaces[0].actualIP).toBe("<redacted>");
		expect(clean.network.interfaces[0].state).toBe("active");
		expect(clean.boards[0].uniqueId).toBe("<redacted>");
		expect(clean.boards[0].firmwareVersion).toBe("3.7.0");
		expect(clean.job.lastFileName).toBe("<redacted>");
	});

	it("derives versions from model.plugins + boards and serialises a Map global", () => {
		const model = loadObjectModel({
			boards: [{ firmwareName: "RepRapFirmware", firmwareVersion: "3.7.0-beta" }],
			plugins: { OmBrowser: { version: "2.0.0", dwcVersion: "3.7.0" } },
			global: { myVar: 7 },
			state: { status: "idle" },
		});
		const report = buildReport({ pluginId: "OmBrowser", model });
		expect(report.plugin).toEqual({ id: "OmBrowser", version: "2.0.0" });
		expect(report.dwcVersion).toBe("3.7.0");
		expect(report.firmware).toEqual({ name: "RepRapFirmware", version: "3.7.0-beta" });
		expect(reportToJson(report)).toContain("\"myVar\": 7");
	});
});
