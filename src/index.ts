// Plugin entry point for the Vue 3 DuetWebControl stack (3.7+).
import { registerRoute, registerPluginMessages } from "@/plugins";
import { useCacheStore } from "@/stores/cache";

import en from "./i18n/en.json";
import OmBrowser from "./OmBrowser.vue";

const PLUGIN_ID = "OmBrowser";

registerPluginMessages(PLUGIN_ID, { en });

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
