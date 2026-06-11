import vue from "@vitejs/plugin-vue";
import { dwcVitestConfig } from "dwc-plugin-test-kit/vitest";

// All the Vitest + Vuetify + DWC-mock wiring lives in the shared kit; this repo only supplies the
// Vue SFC plugin (so it resolves from this repo's node_modules at config-load time).
export default dwcVitestConfig({
	plugins: [vue()],
	// Coverage ratchet: floors set just below the current numbers so coverage can only go up — CI's
	// `test:coverage` fails if a change drops below them. Raise as you add tests. Only enforced under
	// `--coverage`; plain `npm test` stays ungated/fast.
	// Ratchet floors: raised from pre-updateCheck baseline. updateCheck.ts functions are covered by
	// the mount tests (onMounted triggers runUpdateCheck, etc.) but several fallback paths remain
	// uncovered by the 5 smoke tests. Floors set just below actual numbers; raise as tests are added.
	test: { coverage: { thresholds: { statements: 33, branches: 25, functions: 29, lines: 40 } } },
});
