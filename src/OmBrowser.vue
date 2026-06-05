<template>
  <v-container fluid class="om-browser pa-0" style="height:100%;display:flex;flex-direction:column;overflow:hidden">
    <!-- Toolbar -->
    <v-toolbar density="compact" flat color="surface" class="flex-shrink-0">
      <v-toolbar-title class="text-subtitle-2 text-primary">Object Model Browser</v-toolbar-title>
      <span class="text-caption ml-2 text-medium-emphasis">{{ modelRef }}</span>
      <v-spacer />
      <v-text-field
        v-model="searchTerm"
        density="compact" variant="outlined" hide-details clearable
        placeholder="Search properties..."
        prepend-inner-icon="mdi-magnify"
        style="max-width:260px"
      />
      <v-btn icon variant="text" size="small" title="Expand All" @click="expandAll"><v-icon size="small">mdi-chevron-down-box-outline</v-icon></v-btn>
      <v-btn icon variant="text" size="small" title="Collapse All" @click="collapseAll"><v-icon size="small">mdi-chevron-up-box-outline</v-icon></v-btn>
      <v-btn icon variant="text" size="small" title="Refresh" @click="refresh"><v-icon size="small">mdi-refresh</v-icon></v-btn>
    </v-toolbar>

    <!-- Status bar -->
    <div style="display:flex;align-items:center;gap:8px;height:24px;flex-shrink:0;padding:0 16px;background:#1e1e2e;border-bottom:1px solid #313244">
      <span :style="{ width:'7px', height:'7px', borderRadius:'50%', background: hasLiveModel ? '#a6e3a1' : '#7f849c', display:'inline-block', flexShrink:0 }" />
      <span class="text-caption text-medium-emphasis">{{ hasLiveModel ? 'Live — ' + liveKeyCount + ' keys' : 'Reference only (no printer connected)' }}</span>
      <span class="text-caption text-medium-emphasis ml-4">{{ dsfLabel }}</span>
    </div>

    <!-- Main split pane -->
    <div style="display:flex;flex:1;overflow:hidden">

      <!-- Tree panel -->
      <div ref="treePanel" style="width:340px;min-width:160px;flex-shrink:0;border-right:1px solid #313244;overflow-y:auto">
        <template v-if="searchTerm && searchTerm.trim()">
          <div v-if="!searchMatches.length" class="pa-3 text-medium-emphasis text-caption">No results</div>
          <div
            v-for="g in searchMatches" :key="g.clsName"
            :class="['tree-row', { 'tree-row--selected': treeHighlight === g.clsName }]"
            style="padding-left:8px"
            @click="selectSearchResult(g.clsName)"
          >
            <span class="tree-toggle" />
            <span class="tree-name">{{ g.clsName }}</span>
            <span class="tree-type">{{ g.props.length }} props</span>
          </div>
        </template>
        <template v-else>
          <div
            v-for="row in treeRows"
            :key="row.id"
            :class="['tree-row', { 'tree-row--selected': treeHighlight === row.id }]"
            :style="{ paddingLeft: (8 + row.depth * 16) + 'px' }"
            @click="selectRow(row)"
          >
            <span class="tree-toggle" @click.stop="toggleNode(row)">{{ row.hasChildren ? (openNodes[row.id] ? '▼' : '▶') : '' }}</span>
            <span class="tree-name">{{ row.label }}</span>
            <span class="tree-type">{{ row.typeName }}</span>
          </div>
        </template>
      </div>

      <!-- Resizer -->
      <div class="resizer" @mousedown="startResize" />

      <!-- Detail panel -->
      <div ref="detailPanel" style="flex:1;overflow-y:auto;padding:16px 20px">
        <div v-if="!selectedNode" class="text-medium-emphasis text-center" style="margin-top:60px;font-size:14px;line-height:2">
          Select an item in the tree to view details.
        </div>

        <!-- Live object detail — flat table with expandable rows -->
        <template v-else-if="detailMode === 'live'">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
            <h2 class="text-h6 text-primary">{{ detailLabel }}</h2>
            <code class="om-path-code">{{ selectedNode }}</code>
            <v-btn icon variant="text" size="x-small" @click="copyPath(selectedNode)" title="Copy path"><v-icon size="x-small">mdi-content-copy</v-icon></v-btn>
          </div>
          <div v-if="detailClassDesc" class="class-desc mb-4">
            {{ detailClassDesc.summary }}
            <div v-if="detailClassDesc.remarks" class="text-medium-emphasis mt-1" style="font-size:12px;font-style:italic">{{ detailClassDesc.remarks }}</div>
          </div>

          <table class="detail-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
                <th>Type</th>
                <th v-if="detailHasDesc">Description</th>
                <th style="width:28px" />
              </tr>
            </thead>
            <tbody>
              <template v-for="row in flatDetailRows" :key="row.path">
                <tr
                  :class="{ 'row-drilldown': row.drillable }"
                  @click="row.drillable && togglePath(row.path)"
                >
                  <td :style="{ paddingLeft: (4 + row.indent * 20) + 'px' }">
                    <div class="prop-name-cell">
                      <span class="dtoggle">{{ row.drillable ? (openNodes[row.path] ? '▼' : '▶') : '' }}</span>
                      <span class="prop-name">{{ row.key }}</span>
                      <span v-if="row.desc && row.desc.sbcProperty === false" class="tag tag-sbc-only ml-1">SBC only</span>
                      <span v-else-if="row.desc && row.desc.sbcProperty === true" class="tag tag-sbc ml-1">SBC</span>
                    </div>
                  </td>
                  <td><span :class="['live-val', liveValClass(row.value)]">{{ fmtLive(row.value) }}</span></td>
                  <td>
                    <span class="prop-type">{{ row.typeName }}</span>
                    <span v-if="row.nullable" class="text-medium-emphasis" style="font-size:11px"> or null</span>
                    <div v-if="row.enumMembers" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">
                      <span v-for="m in row.enumMembers" :key="m" class="enum-pip">{{ m }}</span>
                    </div>
                  </td>
                  <td v-if="detailHasDesc" class="desc-cell">
                    <template v-if="row.desc">{{ row.desc.summary }}</template>
                    <span v-else class="text-medium-emphasis">—</span>
                  </td>
                  <td style="text-align:center;padding:0 2px">
                    <v-btn icon variant="text" size="x-small" :title="'Copy: ' + row.path" @click.stop="copyPath(row.path)"><v-icon size="x-small">mdi-content-copy</v-icon></v-btn>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </template>

        <!-- Reference class detail -->
        <template v-else-if="detailMode === 'ref' && refClass">
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px;flex-wrap:wrap">
            <h2 class="text-h6 text-primary">{{ refClass.name }}</h2>
          </div>
          <div v-if="currentPaths.length" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
            <span v-for="p in currentPaths" :key="p" style="display:inline-flex;align-items:center;gap:2px">
              <code class="om-path-code">{{ p }}</code>
              <v-btn icon variant="text" size="x-small" @click="copyPath(p)" title="Copy path"><v-icon size="x-small">mdi-content-copy</v-icon></v-btn>
            </span>
          </div>
          <div v-if="refClassDesc" class="class-desc mb-4">
            {{ refClassDesc.summary }}
            <div v-if="refClassDesc.remarks" class="text-medium-emphasis mt-1" style="font-size:12px;font-style:italic">{{ refClassDesc.remarks }}</div>
          </div>
          <div v-if="!refClass.props || !refClass.props.length" class="text-medium-emphasis text-caption mt-4">No properties.</div>
          <v-table v-else density="compact" class="prop-table">
            <template #default>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th v-if="hasAnyRefDesc">Description</th>
                  <th style="width:32px" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in refClass.props"
                  :key="p.name"
                  :class="{ 'row-drilldown': !!refDrillTarget(p) }"
                  @click="refDrillTarget(p) && refNavigate('class', refDrillTarget(p))"
                >
                  <td>
                    <span :class="['prop-name', { 'prop-name--readonly': p.readonly }]">{{ p.name }}</span>
                    <span v-if="refDrillTarget(p)" class="text-primary ml-1">›</span>
                    <span v-if="refPropDesc(p) && refPropDesc(p).sbcProperty === false" class="tag tag-sbc-only ml-1">SBC only</span>
                    <span v-else-if="refPropDesc(p) && refPropDesc(p).sbcProperty === true" class="tag tag-sbc ml-1">SBC</span>
                  </td>
                  <td>
                    <span :class="['prop-type', { 'prop-type--link': refTypeLink(p) }]" @click.stop="refTypeLink(p) && refNavigate(refTypeLink(p).kind, refTypeLink(p).name)">{{ refTypeDisplay(p) }}</span>
                    <span v-if="p.nullable" class="text-medium-emphasis" style="font-size:11px"> or null</span>
                    <div v-if="omModel.enums[p.type]" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">
                      <span v-for="m in omModel.enums[p.type].members" :key="m.key" class="enum-pip">{{ m.key }}</span>
                    </div>
                  </td>
                  <td><code class="prop-default">{{ p.default || '' }}</code></td>
                  <td v-if="hasAnyRefDesc" class="desc-cell">
                    <template v-if="refPropDesc(p)">
                      {{ refPropDesc(p).summary }}
                      <div v-if="refPropDesc(p).remarks" class="text-medium-emphasis mt-1" style="font-size:11px;font-style:italic">{{ refPropDesc(p).remarks }}</div>
                    </template>
                    <span v-else class="text-medium-emphasis">—</span>
                  </td>
                  <td style="text-align:center">
                    <v-btn icon variant="text" size="x-small" :title="'Copy: ' + refPropPath(p)" @click.stop="copyPath(refPropPath(p))"><v-icon size="x-small">mdi-content-copy</v-icon></v-btn>
                  </td>
                </tr>
              </tbody>
            </template>
          </v-table>
        </template>

        <!-- Reference enum detail -->
        <template v-else-if="detailMode === 'ref-enum' && refEnum">
          <h2 class="text-h6 text-primary mb-2">{{ refEnum.name }}</h2>
          <v-table density="compact" class="prop-table">
            <template #default>
              <thead><tr><th>Value</th><th>Description</th></tr></thead>
              <tbody>
                <tr v-for="m in refEnum.members" :key="m.key">
                  <td><code style="color:#a6e3a1">{{ m.key }}</code><code v-if="m.value !== undefined" class="prop-default ml-2">= {{ m.value }}</code></td>
                  <td class="desc-cell">{{ enumMemberDesc(refEnum.name, m.key) || '—' }}</td>
                </tr>
              </tbody>
            </template>
          </v-table>
        </template>
      </div>
    </div>

    <v-snackbar v-model="copiedSnackbar" timeout="1500" location="bottom right" color="success" :elevation="2">
      <v-icon size="small" class="mr-1">mdi-check</v-icon> Copied
    </v-snackbar>
  </v-container>
</template>

<script>
import { omModel as BUNDLED_MODEL, omDescriptions as BUNDLED_DESCRIPTIONS, MODEL_REF, DSF_REF_LABEL } from './model-data.js'
import { useMachineStore } from '@/stores/machine'

// ── Pure helpers (no Vue dependency) ──────────────────────────
function resolveCollectionType (t) {
  let m = t.match(/ModelCollection<([^>]+)>/)
  if (m) return m[1].replace(/\s*\|\s*null/g, '').trim()
  m = t.match(/ModelDictionary<([^>]+)>/)
  if (m) { const p = m[1].split(','); return p[p.length - 1].replace(/\s*\|\s*null/g, '').trim() }
  m = t.match(/Array<([^>]+)>/)
  if (m) return m[1].trim()
  return null
}
function isCollectionType (t) { return /ModelCollection</.test(t) || /Array</.test(t) || t.endsWith('[]') }
function isDictType (t) { return /ModelDictionary</.test(t) || /Map</.test(t) }
function shortType (t) { return t.replace('ModelCollection', 'Collection').replace('ModelDictionary', 'Dict').replace('ModelSet', 'Set') }
function pascalToCamel (s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s }

function liveTypeName (val) {
  if (val === null) return 'null'
  if (Array.isArray(val)) return 'array[' + val.length + ']'
  if (val instanceof Map) return 'map'
  if (typeof val === 'object') return 'object'
  return typeof val
}

function resolvePath (obj, path) {
  try {
    let cur = obj
    for (const seg of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
      if (seg === '') continue
      if (cur == null || typeof cur !== 'object') return undefined
      cur = cur instanceof Map ? cur.get(seg) : cur[seg]
    }
    return cur
  } catch (e) { return undefined }
}

function guessClassName (omModel, path) {
  if (!path) return 'ObjectModel'
  const segs = path.replace(/\[\d+\]/g, '').split('.').filter(Boolean)
  let cls = omModel.classes['ObjectModel']
  for (const seg of segs) {
    if (!cls) return null
    const prop = (cls.props || []).find(p => p.name === seg)
    if (!prop) return null
    const inner = resolveCollectionType(prop.type)
    const t = (inner || prop.type).replace(/\s*\|\s*null/g, '').trim()
    cls = omModel.classes[t] || null
  }
  return cls ? cls.name : null
}

function getDesc (descriptions, className, propName) {
  if (!className) return null
  const d = descriptions[className]
  if (!d) return null
  return d[propName] || d[propName.charAt(0).toUpperCase() + propName.slice(1)] || null
}

// Build a flat list of detail rows for an object, appending expanded children inline.
// openPaths is consulted to decide which drillable rows to expand.
function buildFlatRows (liveModel, rootObj, rootPath, omModel, descriptions, openPaths, indent, out) {
  if (!rootObj || typeof rootObj !== 'object') return
  const typeName = guessClassName(omModel, rootPath)
  const entries = rootObj instanceof Map
    ? Array.from(rootObj.entries())
    : Object.entries(rootObj).sort((a, b) => (a[0] < b[0] ? -1 : 1))

  for (const [key, val] of entries) {
    // Use bracket notation for numeric keys (array indices) to match buildLiveRows
    const isIndex = /^\d+$/.test(key)
    const path = rootPath
      ? (isIndex ? rootPath + '[' + key + ']' : rootPath + '.' + key)
      : String(key)
    const drillable = val !== null && typeof val === 'object'
    const cls = omModel.classes[typeName]
    const tsProp = cls ? (cls.props || []).find(p => p.name === key) : null
    const desc = getDesc(descriptions, typeName, String(key))
    const enumMembers = tsProp && omModel.enums[tsProp.type]
      ? omModel.enums[tsProp.type].members.map(m => m.key) : null

    out.push({ key: String(key), value: val, path, drillable, typeName: liveTypeName(val), nullable: tsProp ? tsProp.nullable : false, desc, enumMembers, indent })

    if (drillable && openPaths[path]) {
      if (Array.isArray(val)) {
        val.forEach((item, i) => {
          const childPath = path + '[' + i + ']'
          const childDrillable = item !== null && typeof item === 'object'
          out.push({ key: String(i), value: item, path: childPath, drillable: childDrillable, typeName: liveTypeName(item), nullable: false, desc: null, enumMembers: null, indent: indent + 1 })
          if (childDrillable && openPaths[childPath]) {
            buildFlatRows(liveModel, item, childPath, omModel, descriptions, openPaths, indent + 2, out)
          }
        })
      } else {
        buildFlatRows(liveModel, val, path, omModel, descriptions, openPaths, indent + 1, out)
      }
    }
  }
}

export default {
  name: 'OmBrowser',

  data () {
    return {
      omModel: BUNDLED_MODEL,
      descriptions: BUNDLED_DESCRIPTIONS,
      modelRef: MODEL_REF,
      dsfLabel: `DSF: ${DSF_REF_LABEL} (${Object.keys(BUNDLED_DESCRIPTIONS).length} types)`,

      openNodes: {},
      searchTerm: '',
      treeVersion: 0,

      selectedNode: null,
      treeHighlight: null,
      detailMode: null,

      copiedSnackbar: false,
      resizing: false,
      resizeStartX: 0,
      resizeStartW: 0
    }
  },

  computed: {
    liveModel () {
      try { return useMachineStore().model } catch (e) { return null }
    },
    // In single-machine Vue 3 DWC the object model always exists (default values when offline), so
    // gate "live" mode on the connection itself to keep the offline reference-schema view.
    hasLiveModel () {
      try { return useMachineStore().isConnected && !!this.liveModel } catch (e) { return false }
    },
    liveKeyCount () { return this.liveModel ? Object.keys(this.liveModel).length : 0 },

    // ── Tree ─────────────────────────────────────────────────────
    treeRows () {
      // eslint-disable-next-line no-unused-expressions
      this.treeVersion
      const rows = []
      if (this.hasLiveModel) {
        this.buildLiveRows(rows, this.liveModel, '', 0)
      } else {
        this.buildRefRows(rows)
      }
      return rows
    },

    // ── Live detail panel ─────────────────────────────────────────
    detailLabel () {
      if (!this.selectedNode) return ''
      const parts = this.selectedNode.split('.')
      return parts[parts.length - 1].replace(/\[\d+\]$/, '') || 'objectModel'
    },

    detailClassDesc () {
      if (this.detailMode !== 'live') return null
      const n = guessClassName(this.omModel, this.selectedNode)
      return n ? (this.descriptions[n] || {}).__class__ || null : null
    },

    // Flat list of all visible rows including expanded children
    flatDetailRows () {
      if (this.detailMode !== 'live' || !this.liveModel) return []
      const rootObj = this.selectedNode ? resolvePath(this.liveModel, this.selectedNode) : this.liveModel
      if (!rootObj || typeof rootObj !== 'object') return []
      const out = []
      buildFlatRows(this.liveModel, rootObj, this.selectedNode, this.omModel, this.descriptions, this.openNodes, 0, out)
      return out
    },

    detailHasDesc () {
      return this.flatDetailRows.some(r => r.desc)
    },

    // ── Reference detail panel ────────────────────────────────────
    refClass () {
      if (this.detailMode !== 'ref' || !this.selectedNode) return null
      return this.omModel.classes[this.selectedNode] || null
    },
    refEnum () {
      if (this.detailMode !== 'ref-enum' || !this.selectedNode) return null
      return this.omModel.enums[this.selectedNode] || null
    },
    refClassDesc () {
      return this.refClass ? (this.descriptions[this.refClass.name] || {}).__class__ || null : null
    },
    currentPaths () {
      return this.refClass ? this.findPaths(this.refClass.name) : []
    },
    hasAnyRefDesc () {
      return this.refClass ? (this.refClass.props || []).some(p => this.refPropDesc(p)) : false
    },

    // ── Search ────────────────────────────────────────────────────
    searchMatches () {
      if (!this.searchTerm || !this.searchTerm.trim()) return []
      const lc = this.searchTerm.toLowerCase()
      const byClass = {}
      for (const cls of Object.values(this.omModel.classes)) {
        for (const prop of cls.props || []) {
          const desc = this.getPropDesc(cls.name, prop.name)
          if (
            prop.name.toLowerCase().includes(lc) ||
            cls.name.toLowerCase().includes(lc) ||
            prop.type.toLowerCase().includes(lc) ||
            (desc && desc.summary && desc.summary.toLowerCase().includes(lc))
          ) {
            if (!byClass[cls.name]) byClass[cls.name] = { clsName: cls.name, props: [] }
            byClass[cls.name].props.push(prop)
          }
        }
      }
      return Object.values(byClass)
    }
  },

  mounted () {
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
  },
  beforeUnmount () {
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  },

  methods: {
    // ── Tree building ─────────────────────────────────────────────
    buildLiveRows (rows, obj, path, depth) {
      if (!obj || typeof obj !== 'object') return
      const entries = obj instanceof Map
        ? Array.from(obj.entries())
        : Object.entries(obj).sort((a, b) => (a[0] < b[0] ? -1 : 1))
      for (const [key, val] of entries) {
        const id = path ? path + '.' + key : String(key)
        const hasChildren = val !== null && typeof val === 'object'
        rows.push({ id, label: String(key), typeName: liveTypeName(val), hasChildren, depth, isLive: true })
        if (hasChildren && this.openNodes[id]) {
          if (Array.isArray(val)) {
            val.forEach((item, i) => {
              const cid = id + '[' + i + ']'
              const ch = item !== null && typeof item === 'object'
              rows.push({ id: cid, label: String(i), typeName: liveTypeName(item), hasChildren: ch, depth: depth + 1, isLive: true })
              if (ch && this.openNodes[cid]) this.buildLiveRows(rows, item, cid, depth + 2)
            })
          } else {
            this.buildLiveRows(rows, val, id, depth + 1)
          }
        }
      }
    },

    buildRefRows (rows) {
      const root = this.omModel.classes['ObjectModel']
      if (!root) return
      const walk = (cls, propName, depth) => {
        const id = 'ref:' + cls.name + ':' + propName
        rows.push({ id, label: propName, typeName: cls.name, hasChildren: true, depth, isLive: false, className: cls.name })
        if (!this.openNodes[id]) return
        for (const p of cls.props || []) {
          const inner = resolveCollectionType(p.type)
          const t = (inner || p.type).replace(/\s*\|\s*null/g, '').trim()
          const child = this.omModel.classes[t]
          if (child) walk(child, p.name, depth + 1)
        }
      }
      walk(root, 'objectModel', 0)
    },

    refresh () { this.treeVersion++ },

    // Returns the parent path of a live path, e.g. boards[0].drivers → boards[0], boards[0] → boards
    parentPath (path) {
      const segs = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
      if (segs.length <= 1) return null
      segs.pop()
      return segs.join('.').replace(/\.(\d+)(?=\.|$)/g, '[$1]')
    },

    // Tree chevron click: toggle expansion, keep detail anchored at parent
    toggleNode (row) {
      const opening = !this.openNodes[row.id]
      this.openNodes[row.id] = opening
      if (row.isLive) {
        // Show the parent in the detail panel so the expanded child appears inline
        const parent = this.parentPath(row.id)
        const newSel = parent || row.id
        this.selectedNode = newSel
        this.treeHighlight = row.id
        this.detailMode = 'live'
      }
    },

    // Detail row chevron click: toggle openNodes (same state tree uses), expand ancestors
    togglePath (path) {
      const opening = !this.openNodes[path]
      this.openNodes[path] = opening
      if (opening) {
        // Ensure all ancestors are open so the tree row is visible
        const segs = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
        const parts = []
        for (let i = 0; i < segs.length - 1; i++) {
          parts.push(segs[i])
          const id = parts.join('.').replace(/\.(\d+)(?=\.|$)/g, '[$1]')
          if (!this.openNodes[id]) this.openNodes[id] = true
        }
        this.treeHighlight = path
      } else {
        this.treeHighlight = this.parentPath(path) || path
      }
      this.scrollTreeHighlight()
    },

    scrollTreeHighlight () {
      this.$nextTick(() => {
        const panel = this.$refs.treePanel
        if (!panel) return
        const sel = panel.querySelector('.tree-row--selected')
        if (sel) sel.scrollIntoView({ block: 'nearest' })
      })
    },

    expandAll () {
      if (this.hasLiveModel) {
        const o = {}
        if (this.liveModel) { for (const k of Object.keys(this.liveModel)) o[k] = true }
        this.openNodes = o
      } else {
        const o = {}
        const walk = (cls, pn, d) => {
          if (d > 4) return
          o['ref:' + cls.name + ':' + pn] = true
          for (const p of cls.props || []) {
            const inner = resolveCollectionType(p.type)
            const t = (inner || p.type).replace(/\s*\|\s*null/g, '').trim()
            const c = this.omModel.classes[t]
            if (c) walk(c, p.name, d + 1)
          }
        }
        const root = this.omModel.classes['ObjectModel']
        if (root) walk(root, 'objectModel', 0)
        this.openNodes = o
      }
    },
    collapseAll () { this.openNodes = {} },

    selectRow (row) {
      if (row.isLive) {
        const val = resolvePath(this.liveModel, row.id)
        const isObj = val !== null && typeof val === 'object'
        const newId = isObj ? row.id : (() => {
          const parts = row.id.replace(/\[\d+\]$/, '').split('.')
          if (parts.length > 1) parts.pop()
          return parts.join('.')
        })()
        this.selectedNode = newId
        this.treeHighlight = row.id
        this.detailMode = 'live'
      } else {
        this.selectedNode = row.className
        this.treeHighlight = row.id
        this.detailMode = 'ref'
      }
    },

    selectSearchResult (clsName) {
      this.selectedNode = clsName
      this.treeHighlight = clsName
      this.detailMode = 'ref'
    },

    // ── Reference navigation ──────────────────────────────────────
    refNavigate (type, name) {
      this.selectedNode = name
      this.detailMode = type === 'enum' ? 'ref-enum' : 'ref'
    },

    // ── Helpers ───────────────────────────────────────────────────
    getPropDesc (className, propName) {
      const d = this.descriptions[className]
      if (!d) return null
      return d[propName] || d[propName.charAt(0).toUpperCase() + propName.slice(1)] || null
    },
    refPropDesc (p) { return this.refClass ? this.getPropDesc(this.refClass.name, p.name) : null },
    enumMemberDesc (enumName, memberName) {
      const d = this.descriptions[enumName]
      if (!d) return null
      const e = d[memberName] || d[pascalToCamel(memberName)]
      return e ? e.summary || null : null
    },
    refDrillTarget (p) {
      const inner = resolveCollectionType(p.type)
      if (isCollectionType(p.type) && inner && this.omModel.classes[inner]) return inner
      if (isDictType(p.type) && inner && this.omModel.classes[inner]) return inner
      if (this.omModel.classes[p.type]) return p.type
      return null
    },
    refTypeDisplay (p) {
      const inner = resolveCollectionType(p.type)
      if (isCollectionType(p.type) && inner) return inner + '[]'
      if (isDictType(p.type) && inner) return inner + '{}'
      return shortType(p.type)
    },
    refTypeLink (p) {
      const inner = resolveCollectionType(p.type)
      if (isCollectionType(p.type) && inner && (this.omModel.classes[inner] || this.omModel.enums[inner])) {
        return { name: inner, kind: this.omModel.classes[inner] ? 'class' : 'enum' }
      }
      if (isDictType(p.type) && inner && this.omModel.classes[inner]) return { name: inner, kind: 'class' }
      if (this.omModel.classes[p.type]) return { name: p.type, kind: 'class' }
      if (this.omModel.enums[p.type]) return { name: p.type, kind: 'enum' }
      return null
    },
    refPropPath (p) {
      const paths = this.findPaths(this.refClass.name)
      const base = paths.length > 0 ? paths[0] : pascalToCamel(this.refClass.name)
      return (base ? base + (isCollectionType(p.type) || isDictType(p.type) ? '[0].' : '.') : '') + p.name
    },
    findPaths (targetClassName) {
      const root = this.omModel.classes['ObjectModel']
      if (!root || !this.omModel.classes[targetClassName]) return []
      const direct = {}
      for (const cls of Object.values(this.omModel.classes)) {
        if (cls.parent) {
          if (!direct[cls.parent]) direct[cls.parent] = new Set()
          direct[cls.parent].add(cls.name)
        }
      }
      const subMap = {}
      const getAll = (name) => {
        if (subMap[name]) return subMap[name]
        subMap[name] = new Set()
        for (const child of (direct[name] || [])) {
          subMap[name].add(child)
          for (const g of getAll(child)) subMap[name].add(g)
        }
        return subMap[name]
      }
      for (const n of Object.keys(direct)) getAll(n)
      const results = new Set()
      const visited = new Set()
      const walk = (cls, soFar) => {
        const key = cls.name + '|' + soFar
        if (visited.has(key)) return
        visited.add(key)
        if (cls.name === targetClassName && soFar) { results.add(soFar); return }
        for (const prop of cls.props || []) {
          const inner = resolveCollectionType(prop.type)
          const t = (inner || prop.type).replace(/\s*\|\s*null/g, '').trim()
          if (!this.omModel.classes[t]) continue
          const suffix = isCollectionType(prop.type) ? '[]' : isDictType(prop.type) ? '{}' : ''
          const seg = soFar ? soFar + '.' + prop.name + suffix : prop.name + suffix
          const toWalk = new Set([t])
          for (const sub of (subMap[t] || [])) toWalk.add(sub)
          for (const n of toWalk) { const c = this.omModel.classes[n]; if (c) walk(c, seg) }
        }
      }
      walk(root, '')
      return [...results].sort()
    },

    fmtLive (val) {
      if (val === undefined) return '—'
      if (val === null) return 'null'
      if (typeof val === 'boolean') return String(val)
      if (typeof val === 'number') return String(val)
      if (typeof val === 'string') return '"' + val + '"'
      if (Array.isArray(val)) return '[' + val.length + ' items]'
      if (val instanceof Map) return '{map ' + val.size + '}'
      return '{object}'
    },
    liveValClass (val) {
      if (val === null || val === undefined) return 'live-val--null'
      if (val === true) return 'live-val--true'
      if (val === false) return 'live-val--false'
      return ''
    },

    copyPath (path) {
      // navigator.clipboard requires focus and secure context — not reliable in DWC iframes.
      // Use execCommand fallback which works everywhere.
      try {
        const el = document.createElement('textarea')
        el.value = path
        el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
        document.body.appendChild(el)
        el.focus()
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        this.copiedSnackbar = true
      } catch (e) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(path).then(() => { this.copiedSnackbar = true }).catch(() => {})
        }
      }
    },

    startResize (e) {
      this.resizing = true
      this.resizeStartX = e.clientX
      this.resizeStartW = this.$refs.treePanel ? this.$refs.treePanel.offsetWidth : 340
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    onMouseMove (e) {
      if (!this.resizing || !this.$refs.treePanel) return
      this.$refs.treePanel.style.width = Math.max(160, Math.min(700, this.resizeStartW + e.clientX - this.resizeStartX)) + 'px'
    },
    onMouseUp () {
      if (!this.resizing) return
      this.resizing = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }
}
</script>

<style scoped>
.om-browser { font-family: 'Segoe UI', system-ui, sans-serif; }

.tree-row {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 8px; border-radius: 4px; cursor: pointer;
  font-size: 13px; user-select: none; min-height: 26px;
}
.tree-row:hover { background: rgba(255,255,255,0.06); }
.tree-row--selected { background: rgba(137,180,250,0.15); }
.tree-toggle { width: 14px; flex-shrink: 0; font-size: 9px; color: #7f849c; text-align: center; }
.tree-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-type { font-size: 11px; color: #7f849c; margin-left: auto; padding-left: 8px; flex-shrink: 0; white-space: nowrap; }

.resizer { width: 5px; background: transparent; cursor: col-resize; flex-shrink: 0; }
.resizer:hover { background: rgba(137,180,250,0.4); }

.om-path-code {
  font-family: monospace; font-size: 12px; color: #f9e2af;
  background: rgba(249,226,175,0.08); border: 1px solid rgba(249,226,175,0.2);
  border-radius: 4px; padding: 2px 8px;
}
.class-desc {
  font-size: 13px; line-height: 1.6;
  background: rgba(137,180,250,0.06); border-left: 3px solid #89b4fa;
  padding: 8px 12px; border-radius: 0 4px 4px 0;
}

/* Flat detail table */
.detail-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.detail-table th {
  text-align: left; font-size: 11px; font-weight: 600; color: #7f849c;
  padding: 4px 8px; border-bottom: 1px solid #313244; white-space: nowrap;
}
.detail-table td { padding: 5px 8px; border-bottom: 1px solid rgba(49,50,68,0.4); vertical-align: top; }
.detail-table tr:last-child td { border-bottom: none; }
.detail-table tbody tr:hover td { background: rgba(255,255,255,0.03); }
.detail-table .row-drilldown { cursor: pointer; }
.detail-table .row-drilldown:hover td { background: rgba(137,180,250,0.06) !important; }

/* Indent guide — left border on expanded children */
.detail-table td[style*="padding-left: 2"] { border-left: 2px solid rgba(137,180,250,0.2); }

.prop-name-cell { display: flex; align-items: center; }
.dtoggle { width: 14px; font-size: 9px; color: #7f849c; text-align: center; flex-shrink: 0; }

.prop-table { width: 100%; }
.prop-name { font-family: monospace; font-weight: 500; }
.prop-name--readonly { color: #cba6f7; }
.prop-type { font-family: monospace; color: #94e2d5; font-size: 12px; }
.prop-type--link { cursor: pointer; text-decoration: underline dotted; }
.prop-type--link:hover { color: #f5c2e7; }
.prop-default { font-family: monospace; font-size: 12px; color: #f9e2af; background: none; }
.desc-cell { font-size: 12px; line-height: 1.5; max-width: 300px; }

.tag { font-size: 10px; border-radius: 3px; padding: 1px 5px; font-weight: 500; }
.tag-sbc-only { background: rgba(250,179,135,0.2); color: #fab387; }
.tag-sbc { background: rgba(148,226,213,0.15); color: #94e2d5; }

.enum-pip {
  font-family: monospace; font-size: 11px; color: #a6e3a1;
  background: rgba(166,227,161,0.1); border: 1px solid rgba(166,227,161,0.25);
  border-radius: 3px; padding: 1px 5px;
}

.live-val { font-family: monospace; font-size: 12px; }
.live-val--null { color: #7f849c; }
.live-val--true { color: #a6e3a1; }
.live-val--false { color: #f38ba8; }
</style>
