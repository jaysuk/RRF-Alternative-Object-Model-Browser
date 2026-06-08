import vue from "@vitejs/plugin-vue";
import { dwcVitestConfig } from "dwc-plugin-test-kit/vitest";

// All the Vitest + Vuetify + DWC-mock wiring lives in the shared kit; this repo only supplies the
// Vue SFC plugin (so it resolves from this repo's node_modules at config-load time).
export default dwcVitestConfig({
	plugins: [vue()],
	// Coverage ratchet: floors set just below the current numbers so coverage can only go up — CI's
	// `test:coverage` fails if a change drops below them. Raise as you add tests. Only enforced under
	// `--coverage`; plain `npm test` stays ungated/fast.
	test: { coverage: { thresholds: { statements: 33, branches: 25, functions: 33, lines: 40 } } },
});
