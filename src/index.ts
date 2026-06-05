// Plugin entry point for the Vue 3 DuetWebControl stack (3.7+).
import { registerRoute, registerPluginMessages } from "@/plugins";
import { useCacheStore } from "@/stores/cache";

import en from "./i18n/en.json";
import OmBrowser from "./OmBrowser.vue";

// Manifest id (plugin.json "id") — used for the cache namespace.
const PLUGIN_ID = "OmBrowser";
// i18n namespace: registerPluginMessages nests the bundle under `plugins.<this>.*`, so the bundle
// must NOT be pre-namespaced and the key must match the `plugins.omBrowser.*` keys used in the view.
const I18N_ID = "omBrowser";

registerPluginMessages(I18N_ID, { en });

// Browser-local UI preferences that should survive leaving and returning to the page.
const cache = useCacheStore();
cache.registerPluginData(PLUGIN_ID, "treeWidth", 340);
cache.registerPluginData(PLUGIN_ID, "pins", [] as Array<string>);

registerRoute(OmBrowser, {
	Plugins: {
		OmBrowser: {
			icon: "mdi-file-tree",
			caption: "plugins.omBrowser.menuCaption",
			path: "/Plugins/OmBrowser",
			pageFill: true
		}
	}
});
