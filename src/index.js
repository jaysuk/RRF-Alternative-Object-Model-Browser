import { registerRoute } from '@/routes'
import OmBrowser from './OmBrowser.vue'

registerRoute(OmBrowser, {
  Plugins: {
    OmBrowser: {
      icon: 'mdi-file-tree',
      caption: 'Object Model Browser',
      translated: true,
      path: '/Plugins/OmBrowser'
    }
  }
})
