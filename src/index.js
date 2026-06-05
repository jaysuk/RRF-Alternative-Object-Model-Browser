// Plugin entry point for the Vue 3 DuetWebControl stack (3.7+).
// The plugin API moved from `@/routes` (Vue 2 DWC) to `@/plugins`; the route descriptor shape is
// otherwise unchanged. `pageFill: true` lets the split-pane browser fill the viewport height.
import { registerRoute } from '@/plugins'
import OmBrowser from './OmBrowser.vue'

registerRoute(OmBrowser, {
  Plugins: {
    OmBrowser: {
      icon: 'mdi-file-tree',
      caption: 'Object Model Browser',
      translated: true,
      path: '/Plugins/OmBrowser',
      pageFill: true
    }
  }
})
