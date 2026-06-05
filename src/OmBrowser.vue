<template>
  <v-container fluid class="om-browser pa-0 d-flex flex-column" style="height:100%;overflow:hidden">
    <!-- Toolbar -->
    <v-toolbar density="compact" flat color="surface" class="flex-shrink-0">
      <v-toolbar-title class="text-subtitle-2 text-primary">{{ $t('plugins.omBrowser.title') }}</v-toolbar-title>
      <span class="text-caption ml-2 text-medium-emphasis">{{ modelRef }}</span>
      <v-spacer />
      <v-text-field
        v-model="searchTerm"
        density="compact" variant="outlined" hide-details clearable
        :placeholder="$t('plugins.omBrowser.search')"
        prepend-inner-icon="mdi-magnify"
        style="max-width:260px"
      />
      <v-btn icon variant="text" size="small" :title="$t('plugins.omBrowser.expandAll')" @click="expandAll"><v-icon size="small">mdi-chevron-down-box-outline</v-icon></v-btn>
      <v-btn icon variant="text" size="small" :title="$t('plugins.omBrowser.collapseAll')" @click="collapseAll"><v-icon size="small">mdi-chevron-up-box-outline</v-icon></v-btn>
      <v-btn icon variant="text" size="small" :title="$t('plugins.omBrowser.refresh')" @click="refresh"><v-icon size="small">mdi-refresh</v-icon></v-btn>
    </v-toolbar>

    <!-- Status bar -->
    <div class="om-status flex-shrink-0">
      <span class="om-dot" :class="hasLiveModel ? 'om-dot--live' : 'om-dot--off'" />
      <span class="text-caption text-medium-emphasis">{{ hasLiveModel ? $t('plugins.omBrowser.live', { count: liveKeyCount }) : $t('plugins.omBrowser.reference') }}</span>
      <span class="text-caption text-medium-emphasis ml-4">{{ dsfLabel }}</span>
    </div>

    <!-- Main split pane -->
    <div class="d-flex flex-grow-1" style="overflow:hidden">

      <!-- Tree column (scrollable tree + pinned watch list) -->
      <div class="om-tree-col flex-shrink-0" :style="{ width: treeWidth + 'px' }">
        <div ref="treePanel" class="om-tree-scroll" tabindex="0" @keydown="onTreeKey">
          <template v-if="debouncedSearch && debouncedSearch.trim()">
            <div v-if="liveSearchMatches.length" class="om-search-head">{{ $t('plugins.omBrowser.searchLive') }}</div>
            <div
              v-for="m in liveSearchMatches" :key="'l:' + m.path"
              :class="['tree-row', { 'tree-row--selected': treeHighlight === m.path }]"
              style="padding-left:8px"
              @click="revealLivePath(m.path)"
            >
              <span class="tree-toggle" />
              <span class="tree-name">{{ m.path }}</span>
              <span class="tree-type">{{ fmtLive(m.value) }}</span>
            </div>
            <div class="om-search-head">{{ $t('plugins.omBrowser.searchSchema') }}</div>
            <div v-if="!searchMatches.length && !liveSearchMatches.length" class="pa-3 text-medium-emphasis text-caption">{{ $t('plugins.omBrowser.noResults') }}</div>
            <div
              v-for="g in searchMatches" :key="g.clsName"
              :class="['tree-row', { 'tree-row--selected': treeHighlight === g.clsName }]"
              style="padding-left:8px"
              @click="selectSearchResult(g.clsName)"
            >
              <span class="tree-toggle" />
              <span class="tree-name">{{ g.clsName }}</span>
              <span class="tree-type">{{ $t('plugins.omBrowser.propCount', { count: g.props.length }) }}</span>
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

        <!-- Pinned watch list -->
        <div v-if="hasLiveModel && pins.length" class="om-watch">
          <div class="om-watch-head">
            <v-icon size="x-small" class="mr-1">mdi-pin</v-icon>{{ $t('plugins.omBrowser.watch') }} ({{ pins.length }})
          </div>
          <div v-for="w in pinnedRows" :key="'w:' + w.path" class="om-watch-row" @click="revealLivePath(w.path)">
            <span class="om-watch-path">{{ w.path }}</span>
            <span :class="['om-watch-val', liveValClass(w.value)]">{{ fmtLive(w.value) }}</span>
            <v-btn icon variant="text" size="x-small" :title="$t('plugins.omBrowser.unpin')" @click.stop="togglePin(w.path)"><v-icon size="x-small">mdi-close</v-icon></v-btn>
          </div>
        </div>
      </div>

      <!-- Resizer -->
      <div class="resizer" @mousedown="startResize" />

      <!-- Detail panel -->
      <div class="flex-grow-1" style="overflow-y:auto;padding:16px 20px">
        <div v-if="!selectedNode" class="text-medium-emphasis text-center" style="margin-top:60px;font-size:14px;line-height:2">
          {{ $t('plugins.omBrowser.selectPrompt') }}
        </div>

        <!-- Live object detail — flat table with expandable rows -->
        <template v-else-if="detailMode === 'live'">
          <div class="d-flex align-center flex-wrap" style="gap:8px;margin-bottom:12px">
            <h2 class="text-h6 text-primary">{{ detailLabel }}</h2>
            <code class="om-path-code">{{ selectedNode }}</code>
            <v-btn icon variant="text" size="x-small" :title="$t('plugins.omBrowser.copyPath')" @click="copyPath(selectedNode)"><v-icon size="x-small">mdi-content-copy</v-icon></v-btn>
            <v-btn icon variant="text" size="x-small" :title="$t('plugins.omBrowser.copyJson')" @click="copyJson(selectedNode)"><v-icon size="x-small">mdi-code-json</v-icon></v-btn>
            <v-btn icon variant="text" size="x-small" :title="$t('plugins.omBrowser.downloadJson')" @click="downloadJson(selectedNode)"><v-icon size="x-small">mdi-download</v-icon></v-btn>
            <v-btn icon variant="text" size="x-small" :title="$t('plugins.omBrowser.copyLink')" @click="copyLink(selectedNode)"><v-icon size="x-small">mdi-link-variant</v-icon></v-btn>
          </div>
          <div v-if="detailClassDesc" class="class-desc mb-4">
            {{ detailClassDesc.summary }}
            <div v-if="detailClassDesc.remarks" class="text-medium-emphasis mt-1" style="font-size:12px;font-style:italic">{{ detailClassDesc.remarks }}</div>
          </div>

          <table class="detail-table">
            <thead>
              <tr>
                <th>{{ $t('plugins.omBrowser.colProperty') }}</th>
                <th>{{ $t('plugins.omBrowser.colValue') }}</th>
                <th>{{ $t('plugins.omBrowser.colType') }}</th>
                <th v-if="detailHasDesc">{{ $t('plugins.omBrowser.colDescription') }}</th>
                <th style="width:54px" />
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
                      <span v-if="row.desc && row.desc.sbcProperty === false" class="tag tag-sbc-only ml-1">{{ $t('plugins.omBrowser.sbcOnly') }}</span>
                      <span v-else-if="row.desc && row.desc.sbcProperty === true" class="tag tag-sbc ml-1">{{ $t('plugins.omBrowser.sbc') }}</span>
                    </div>
                  </td>
                  <td><span :class="['live-val', liveValClass(row.value)]">{{ fmtLive(row.value) }}</span></td>
                  <td>
                    <span class="prop-type">{{ row.typeName }}</span>
                    <span v-if="row.nullable" class="text-medium-emphasis" style="font-size:11px"> {{ $t('plugins.omBrowser.orNull') }}</span>
                    <div v-if="row.enumMembers" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">
                      <span v-for="m in row.enumMembers" :key="m" class="enum-pip">{{ m }}</span>
                    </div>
                  </td>
                  <td v-if="detailHasDesc" class="desc-cell">
                    <template v-if="row.desc">{{ row.desc.summary }}</template>
                    <span v-else class="text-medium-emphasis">—</span>
                  </td>
                  <td style="text-align:right;white-space:nowrap;padding:0 2px">
                    <v-btn icon variant="text" size="x-small" :title="isPinned(row.path) ? $t('plugins.omBrowser.unpin') : $t('plugins.omBrowser.pin')" @click.stop="togglePin(row.path)"><v-icon size="x-small" :color="isPinned(row.path) ? 'primary' : undefined">{{ isPinned(row.path) ? 'mdi-pin' : 'mdi-pin-outline' }}</v-icon></v-btn>
                    <v-btn icon variant="text" size="x-small" :title="$t('plugins.omBrowser.copyPath')" @click.stop="copyPath(row.path)"><v-icon size="x-small">mdi-content-copy</v-icon></v-btn>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </template>

        <!-- Reference class detail -->
        <template v-else-if="detailMode === 'ref' && refClass">
          <div class="d-flex flex-wrap" style="align-items:baseline;gap:10px;margin-bottom:6px">
            <h2 class="text-h6 text-primary">{{ refClass.name }}</h2>
          </div>
          <div v-if="currentPaths.length" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
            <span v-for="p in currentPaths" :key="p" style="display:inline-flex;align-items:center;gap:2px">
              <code class="om-path-code">{{ p }}</code>
              <v-btn icon variant="text" size="x-small" :title="$t('plugins.omBrowser.copyPath')" @click="copyPath(p)"><v-icon size="x-small">mdi-content-copy</v-icon></v-btn>
            </span>
          </div>
          <div v-if="refClassDesc" class="class-desc mb-4">
            {{ refClassDesc.summary }}
            <div v-if="refClassDesc.remarks" class="text-medium-emphasis mt-1" style="font-size:12px;font-style:italic">{{ refClassDesc.remarks }}</div>
          </div>
          <div v-if="!refClass.props || !refClass.props.length" class="text-medium-emphasis text-caption mt-4">{{ $t('plugins.omBrowser.noProperties') }}</div>
          <v-table v-else density="compact" class="prop-table">
            <template #default>
              <thead>
                <tr>
                  <th>{{ $t('plugins.omBrowser.colProperty') }}</th>
                  <th>{{ $t('plugins.omBrowser.colType') }}</th>
                  <th>{{ $t('plugins.omBrowser.colDefault') }}</th>
                  <th v-if="hasAnyRefDesc">{{ $t('plugins.omBrowser.colDescription') }}</th>
                  <th style="width:32px" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in refClass.props"
                  :key="p.name"
                  :class="{ 'row-drilldown': !!refDrillTarget(p) }"
                  @click="refDrillTarget(p) && refNavigate('class', refDrillTarget(p) as string)"
                >
                  <td>
                    <span :class="['prop-name', { 'prop-name--readonly': p.readonly }]">{{ p.name }}</span>
                    <span v-if="refDrillTarget(p)" class="text-primary ml-1">›</span>
                    <span v-if="refPropDesc(p) && refPropDesc(p)!.sbcProperty === false" class="tag tag-sbc-only ml-1">{{ $t('plugins.omBrowser.sbcOnly') }}</span>
                    <span v-else-if="refPropDesc(p) && refPropDesc(p)!.sbcProperty === true" class="tag tag-sbc ml-1">{{ $t('plugins.omBrowser.sbc') }}</span>
                  </td>
                  <td>
                    <span :class="['prop-type', { 'prop-type--link': refTypeLink(p) }]" @click.stop="refTypeLink(p) && refNavigate(refTypeLink(p)!.kind, refTypeLink(p)!.name)">{{ refTypeDisplay(p) }}</span>
                    <span v-if="p.nullable" class="text-medium-emphasis" style="font-size:11px"> {{ $t('plugins.omBrowser.orNull') }}</span>
                    <div v-if="omModel.enums[p.type]" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">
                      <span v-for="m in omModel.enums[p.type].members" :key="m.key" class="enum-pip">{{ m.key }}</span>
                    </div>
                  </td>
                  <td><code class="prop-default">{{ p.default || '' }}</code></td>
                  <td v-if="hasAnyRefDesc" class="desc-cell">
                    <template v-if="refPropDesc(p)">
                      {{ refPropDesc(p)!.summary }}
                      <div v-if="refPropDesc(p)!.remarks" class="text-medium-emphasis mt-1" style="font-size:11px;font-style:italic">{{ refPropDesc(p)!.remarks }}</div>
                    </template>
                    <span v-else class="text-medium-emphasis">—</span>
                  </td>
                  <td style="text-align:center">
                    <v-btn icon variant="text" size="x-small" :title="$t('plugins.omBrowser.copyPath')" @click.stop="copyPath(refPropPath(p))"><v-icon size="x-small">mdi-content-copy</v-icon></v-btn>
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
              <thead><tr><th>{{ $t('plugins.omBrowser.colValue') }}</th><th>{{ $t('plugins.omBrowser.colDescription') }}</th></tr></thead>
              <tbody>
                <tr v-for="m in refEnum.members" :key="m.key">
                  <td><code class="enum-key">{{ m.key }}</code><code v-if="m.value !== undefined" class="prop-default ml-2">= {{ m.value }}</code></td>
                  <td class="desc-cell">{{ enumMemberDesc(refEnum.name, m.key) || '—' }}</td>
                </tr>
              </tbody>
            </template>
          </v-table>
        </template>
      </div>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, toRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import i18n from "@/i18n";
import { useCacheStore } from "@/stores/cache";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import {
  omModel as BUNDLED_MODEL,
  omDescriptions as BUNDLED_DESCRIPTIONS,
  MODEL_REF,
  DSF_REF_LABEL,
  type OmModel,
  type OmDescriptions,
  type OmClass,
  type OmProp,
  type OmDesc,
} from "./model-data.js";

const PLUGIN_ID = "OmBrowser";

// ── Pure helpers (no Vue dependency) ──────────────────────────
function resolveCollectionType(t: string): string | null {
  let m = t.match(/ModelCollection<([^>]+)>/);
  if (m) return m[1].replace(/\s*\|\s*null/g, "").trim();
  m = t.match(/ModelDictionary<([^>]+)>/);
  if (m) { const p = m[1].split(","); return p[p.length - 1].replace(/\s*\|\s*null/g, "").trim(); }
  m = t.match(/Array<([^>]+)>/);
  if (m) return m[1].trim();
  return null;
}
function isCollectionType(t: string): boolean { return /ModelCollection</.test(t) || /Array</.test(t) || t.endsWith("[]"); }
function isDictType(t: string): boolean { return /ModelDictionary</.test(t) || /Map</.test(t); }
function shortType(t: string): string { return t.replace("ModelCollection", "Collection").replace("ModelDictionary", "Dict").replace("ModelSet", "Set"); }
function pascalToCamel(s: string): string { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

function liveTypeName(val: unknown): string {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array[" + val.length + "]";
  if (val instanceof Map) return "map";
  if (typeof val === "object") return "object";
  return typeof val;
}

function resolvePath(obj: unknown, path: string): unknown {
  try {
    let cur: unknown = obj;
    for (const seg of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
      if (seg === "") continue;
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur instanceof Map ? cur.get(seg) : (cur as Record<string, unknown>)[seg];
    }
    return cur;
  } catch (e) { return undefined; }
}

function guessClassName(model: OmModel, path: string | null): string | null {
  if (!path) return "ObjectModel";
  const segs = path.replace(/\[\d+\]/g, "").split(".").filter(Boolean);
  let cls: OmClass | null = model.classes["ObjectModel"] || null;
  for (const seg of segs) {
    if (!cls) return null;
    const prop: OmProp | undefined = (cls.props || []).find((p: OmProp) => p.name === seg);
    if (!prop) return null;
    const inner = resolveCollectionType(prop.type);
    const resolved: string = (inner || prop.type).replace(/\s*\|\s*null/g, "").trim();
    cls = model.classes[resolved] || null;
  }
  return cls ? cls.name : null;
}

function getDesc(descriptions: OmDescriptions, className: string | null, propName: string): OmDesc | null {
  if (!className) return null;
  const d = descriptions[className];
  if (!d) return null;
  return d[propName] || d[propName.charAt(0).toUpperCase() + propName.slice(1)] || null;
}

interface DetailRow { key: string; value: unknown; path: string; drillable: boolean; typeName: string; nullable: boolean; desc: OmDesc | null; enumMembers: Array<string> | null; indent: number }
interface TreeRow { id: string; label: string; typeName: string; hasChildren: boolean; depth: number; isLive: boolean; className?: string }

// Build a flat list of detail rows for an object, appending expanded children inline.
function buildFlatRows(rootObj: unknown, rootPath: string | null, model: OmModel, descriptions: OmDescriptions, openPaths: Record<string, boolean>, indent: number, out: Array<DetailRow>): void {
  if (!rootObj || typeof rootObj !== "object") return;
  const typeName = guessClassName(model, rootPath);
  const entries: Array<[string, unknown]> = rootObj instanceof Map
    ? Array.from(rootObj.entries())
    : Object.entries(rootObj).sort((a, b) => (a[0] < b[0] ? -1 : 1));

  for (const [key, val] of entries) {
    const isIndex = /^\d+$/.test(key);
    const path = rootPath
      ? (isIndex ? rootPath + "[" + key + "]" : rootPath + "." + key)
      : String(key);
    const drillable = val !== null && typeof val === "object";
    const cls = typeName ? model.classes[typeName] : null;
    const tsProp = cls ? (cls.props || []).find((p) => p.name === key) : null;
    const desc = getDesc(descriptions, typeName, String(key));
    const enumMembers = tsProp && model.enums[tsProp.type]
      ? model.enums[tsProp.type].members.map((m) => m.key) : null;

    out.push({ key: String(key), value: val, path, drillable, typeName: liveTypeName(val), nullable: tsProp ? !!tsProp.nullable : false, desc, enumMembers, indent });

    if (drillable && openPaths[path]) {
      if (Array.isArray(val)) {
        val.forEach((item, i) => {
          const childPath = path + "[" + i + "]";
          const childDrillable = item !== null && typeof item === "object";
          out.push({ key: String(i), value: item, path: childPath, drillable: childDrillable, typeName: liveTypeName(item), nullable: false, desc: null, enumMembers: null, indent: indent + 1 });
          if (childDrillable && openPaths[childPath]) {
            buildFlatRows(item, childPath, model, descriptions, openPaths, indent + 2, out);
          }
        });
      } else {
        buildFlatRows(val, path, model, descriptions, openPaths, indent + 1, out);
      }
    }
  }
}

// ── Stores / framework ────────────────────────────────────────
const machineStore = useMachineStore();
const uiStore = useUiStore();
const cacheStore = useCacheStore();
const route = useRoute();
const router = useRouter();
const t = (key: string, named?: Record<string, unknown>) => i18n.global.t(key, named ?? {});

const omModel = BUNDLED_MODEL;
const descriptions = BUNDLED_DESCRIPTIONS;
const modelRef = MODEL_REF;
const dsfLabel = `DSF: ${DSF_REF_LABEL} (${Object.keys(BUNDLED_DESCRIPTIONS).length} types)`;

// ── State ─────────────────────────────────────────────────────
const openNodes = reactive<Record<string, boolean>>({});
const searchTerm = ref("");
const debouncedSearch = ref("");
const selectedNode = ref<string | null>(null);
const treeHighlight = ref<string | null>(null);
const detailMode = ref<"live" | "ref" | "ref-enum" | null>(null);

const treePanel = ref<HTMLElement | null>(null);

// `modelTick` is the throttle valve: the live model is read non-reactively (toRaw) so deep changes
// don't re-run the heavy computeds on every poll; instead a timer bumps this a few times a second.
const modelTick = ref(0);

// Persisted UI prefs (registered in index.ts).
const pluginCache = () => (cacheStore.plugins as Record<string, Record<string, unknown>>)[PLUGIN_ID] ?? {};
const treeWidth = ref<number>(Number(pluginCache().treeWidth) || 340);
const pins = ref<Array<string>>(Array.isArray(pluginCache().pins) ? [...(pluginCache().pins as Array<string>)] : []);
watch(treeWidth, (w) => cacheStore.setPluginData(PLUGIN_ID, "treeWidth", w));
watch(pins, (p) => cacheStore.setPluginData(PLUGIN_ID, "pins", [...p]), { deep: true });

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchTerm, (v) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { debouncedSearch.value = v || ""; }, 250);
});

// ── Live model access ─────────────────────────────────────────
const hasLiveModel = computed(() => machineStore.isConnected && !!machineStore.model);
function liveRoot(): unknown { return toRaw(machineStore.model); }

const liveKeyCount = computed(() => {
  void modelTick.value;
  const m = liveRoot();
  return m && typeof m === "object" ? Object.keys(m).length : 0;
});

// ── Tree ──────────────────────────────────────────────────────
function buildLiveRows(rows: Array<TreeRow>, obj: unknown, path: string, depth: number): void {
  if (!obj || typeof obj !== "object") return;
  const entries: Array<[string, unknown]> = obj instanceof Map
    ? Array.from(obj.entries())
    : Object.entries(obj).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [key, val] of entries) {
    const id = path ? path + "." + key : String(key);
    const hasChildren = val !== null && typeof val === "object";
    rows.push({ id, label: String(key), typeName: liveTypeName(val), hasChildren, depth, isLive: true });
    if (hasChildren && openNodes[id]) {
      if (Array.isArray(val)) {
        val.forEach((item, i) => {
          const cid = id + "[" + i + "]";
          const ch = item !== null && typeof item === "object";
          rows.push({ id: cid, label: String(i), typeName: liveTypeName(item), hasChildren: ch, depth: depth + 1, isLive: true });
          if (ch && openNodes[cid]) buildLiveRows(rows, item, cid, depth + 2);
        });
      } else {
        buildLiveRows(rows, val, id, depth + 1);
      }
    }
  }
}

function buildRefRows(rows: Array<TreeRow>): void {
  const root = omModel.classes["ObjectModel"];
  if (!root) return;
  const walk = (cls: OmClass, propName: string, depth: number) => {
    const id = "ref:" + cls.name + ":" + propName;
    rows.push({ id, label: propName, typeName: cls.name, hasChildren: true, depth, isLive: false, className: cls.name });
    if (!openNodes[id]) return;
    for (const p of cls.props || []) {
      const inner = resolveCollectionType(p.type);
      const tt = (inner || p.type).replace(/\s*\|\s*null/g, "").trim();
      const child = omModel.classes[tt];
      if (child) walk(child, p.name, depth + 1);
    }
  };
  walk(root, "objectModel", 0);
}

const treeRows = computed<Array<TreeRow>>(() => {
  void modelTick.value;
  const rows: Array<TreeRow> = [];
  if (hasLiveModel.value) buildLiveRows(rows, liveRoot(), "", 0);
  else buildRefRows(rows);
  return rows;
});

function refresh(): void { modelTick.value++; }

// ── Live detail panel ─────────────────────────────────────────
const detailLabel = computed(() => {
  if (!selectedNode.value) return "";
  const parts = selectedNode.value.split(".");
  return parts[parts.length - 1].replace(/\[\d+\]$/, "") || "objectModel";
});

const detailClassDesc = computed<OmDesc | null>(() => {
  if (detailMode.value !== "live") return null;
  const n = guessClassName(omModel, selectedNode.value);
  return n ? (descriptions[n] || {}).__class__ || null : null;
});

const flatDetailRows = computed<Array<DetailRow>>(() => {
  void modelTick.value;
  if (detailMode.value !== "live" || !hasLiveModel.value) return [];
  const rootObj = selectedNode.value ? resolvePath(liveRoot(), selectedNode.value) : liveRoot();
  if (!rootObj || typeof rootObj !== "object") return [];
  const out: Array<DetailRow> = [];
  buildFlatRows(rootObj, selectedNode.value, omModel, descriptions, openNodes, 0, out);
  return out;
});

const detailHasDesc = computed(() => flatDetailRows.value.some((r) => r.desc));

// ── Reference detail panel ────────────────────────────────────
const refClass = computed<OmClass | null>(() => {
  if (detailMode.value !== "ref" || !selectedNode.value) return null;
  return omModel.classes[selectedNode.value] || null;
});
const refEnum = computed(() => {
  if (detailMode.value !== "ref-enum" || !selectedNode.value) return null;
  return omModel.enums[selectedNode.value] || null;
});
const refClassDesc = computed<OmDesc | null>(() => refClass.value ? (descriptions[refClass.value.name] || {}).__class__ || null : null);
const currentPaths = computed(() => refClass.value ? findPaths(refClass.value.name) : []);
const hasAnyRefDesc = computed(() => refClass.value ? (refClass.value.props || []).some((p) => refPropDesc(p)) : false);

// ── Search ────────────────────────────────────────────────────
const searchMatches = computed(() => {
  const term = debouncedSearch.value;
  if (!term || !term.trim()) return [] as Array<{ clsName: string; props: Array<OmProp> }>;
  const lc = term.toLowerCase();
  const byClass: Record<string, { clsName: string; props: Array<OmProp> }> = {};
  for (const cls of Object.values(omModel.classes)) {
    for (const prop of cls.props || []) {
      const desc = getPropDesc(cls.name, prop.name);
      if (
        prop.name.toLowerCase().includes(lc) ||
        cls.name.toLowerCase().includes(lc) ||
        prop.type.toLowerCase().includes(lc) ||
        (desc && desc.summary && desc.summary.toLowerCase().includes(lc))
      ) {
        if (!byClass[cls.name]) byClass[cls.name] = { clsName: cls.name, props: [] };
        byClass[cls.name].props.push(prop);
      }
    }
  }
  return Object.values(byClass);
});

// Live-value search: walk the connected model for paths/values matching the term (bounded).
const liveSearchMatches = computed(() => {
  void modelTick.value;
  if (!hasLiveModel.value) return [] as Array<{ path: string; value: unknown }>;
  const lc = debouncedSearch.value.trim().toLowerCase();
  if (!lc) return [];
  const out: Array<{ path: string; value: unknown }> = [];
  const walk = (obj: unknown, path: string, depth: number) => {
    if (out.length >= 200 || depth > 8 || !obj || typeof obj !== "object") return;
    const entries: Array<[string, unknown]> = obj instanceof Map ? Array.from(obj.entries()) : Object.entries(obj);
    for (const [k, v] of entries) {
      if (out.length >= 200) return;
      const isIndex = /^\d+$/.test(String(k));
      const p = path ? (isIndex ? `${path}[${k}]` : `${path}.${k}`) : String(k);
      const keyMatch = String(k).toLowerCase().includes(lc);
      const valMatch = (v === null || typeof v !== "object") && String(v).toLowerCase().includes(lc);
      if (keyMatch || valMatch) out.push({ path: p, value: v });
      if (v && typeof v === "object") walk(v, p, depth + 1);
    }
  };
  walk(liveRoot(), "", 0);
  return out;
});

// ── Pinned watch list ─────────────────────────────────────────
const pinnedRows = computed(() => {
  void modelTick.value;
  const root = liveRoot();
  return pins.value.map((p) => ({ path: p, value: resolvePath(root, p) }));
});
function isPinned(path: string): boolean { return pins.value.includes(path); }
function togglePin(path: string): void {
  const i = pins.value.indexOf(path);
  if (i >= 0) pins.value.splice(i, 1);
  else pins.value.push(path);
}

// ── Tree navigation ───────────────────────────────────────────
function parentPath(path: string): string | null {
  const segs = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  if (segs.length <= 1) return null;
  segs.pop();
  return segs.join(".").replace(/\.(\d+)(?=\.|$)/g, "[$1]");
}

function toggleNode(row: TreeRow): void {
  const opening = !openNodes[row.id];
  openNodes[row.id] = opening;
  if (row.isLive) {
    const parent = parentPath(row.id);
    selectedNode.value = parent || row.id;
    treeHighlight.value = row.id;
    detailMode.value = "live";
    syncQuery();
  }
}

function togglePath(path: string): void {
  const opening = !openNodes[path];
  openNodes[path] = opening;
  if (opening) {
    const segs = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
    const parts: Array<string> = [];
    for (let i = 0; i < segs.length - 1; i++) {
      parts.push(segs[i]);
      const id = parts.join(".").replace(/\.(\d+)(?=\.|$)/g, "[$1]");
      if (!openNodes[id]) openNodes[id] = true;
    }
    treeHighlight.value = path;
  } else {
    treeHighlight.value = parentPath(path) || path;
  }
  scrollTreeHighlight();
}

function scrollTreeHighlight(): void {
  requestAnimationFrame(() => {
    const panel = treePanel.value;
    if (!panel) return;
    const sel = panel.querySelector(".tree-row--selected");
    if (sel) (sel as HTMLElement).scrollIntoView({ block: "nearest" });
  });
}

function expandAll(): void {
  if (hasLiveModel.value) {
    const o: Record<string, boolean> = {};
    const m = liveRoot();
    if (m && typeof m === "object") for (const k of Object.keys(m)) o[k] = true;
    Object.keys(openNodes).forEach((k) => delete openNodes[k]);
    Object.assign(openNodes, o);
  } else {
    const o: Record<string, boolean> = {};
    const walk = (cls: OmClass, pn: string, d: number) => {
      if (d > 4) return;
      o["ref:" + cls.name + ":" + pn] = true;
      for (const p of cls.props || []) {
        const inner = resolveCollectionType(p.type);
        const tt = (inner || p.type).replace(/\s*\|\s*null/g, "").trim();
        const c = omModel.classes[tt];
        if (c) walk(c, p.name, d + 1);
      }
    };
    const root = omModel.classes["ObjectModel"];
    if (root) walk(root, "objectModel", 0);
    Object.keys(openNodes).forEach((k) => delete openNodes[k]);
    Object.assign(openNodes, o);
  }
}
function collapseAll(): void { Object.keys(openNodes).forEach((k) => delete openNodes[k]); }

function selectRow(row: TreeRow): void {
  if (row.isLive) {
    const val = resolvePath(liveRoot(), row.id);
    const isObj = val !== null && typeof val === "object";
    const newId = isObj ? row.id : (() => {
      const parts = row.id.replace(/\[\d+\]$/, "").split(".");
      if (parts.length > 1) parts.pop();
      return parts.join(".");
    })();
    selectedNode.value = newId;
    treeHighlight.value = row.id;
    detailMode.value = "live";
    syncQuery();
  } else {
    selectedNode.value = row.className ?? null;
    treeHighlight.value = row.id;
    detailMode.value = "ref";
  }
}

function selectSearchResult(clsName: string): void {
  selectedNode.value = clsName;
  treeHighlight.value = clsName;
  detailMode.value = "ref";
}

// Reveal a live path: expand its ancestors in the tree and show it in the detail panel.
function revealLivePath(path: string): void {
  const segs = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  const parts: Array<string> = [];
  for (let i = 0; i < segs.length; i++) {
    parts.push(segs[i]);
    const id = parts.join(".").replace(/\.(\d+)(?=\.|$)/g, "[$1]");
    if (i < segs.length - 1) openNodes[id] = true;
  }
  const val = resolvePath(liveRoot(), path);
  const isObj = val !== null && typeof val === "object";
  selectedNode.value = isObj ? path : (parentPath(path) || path);
  treeHighlight.value = path;
  detailMode.value = "live";
  searchTerm.value = "";
  syncQuery();
  scrollTreeHighlight();
}

// ── Reference navigation / helpers ────────────────────────────
function refNavigate(type: string, name: string): void {
  selectedNode.value = name;
  detailMode.value = type === "enum" ? "ref-enum" : "ref";
}
function getPropDesc(className: string, propName: string): OmDesc | null {
  const d = descriptions[className];
  if (!d) return null;
  return d[propName] || d[propName.charAt(0).toUpperCase() + propName.slice(1)] || null;
}
function refPropDesc(p: OmProp): OmDesc | null { return refClass.value ? getPropDesc(refClass.value.name, p.name) : null; }
function enumMemberDesc(enumName: string, memberName: string): string | null {
  const d = descriptions[enumName];
  if (!d) return null;
  const e = d[memberName] || d[pascalToCamel(memberName)];
  return e ? e.summary || null : null;
}
function refDrillTarget(p: OmProp): string | null {
  const inner = resolveCollectionType(p.type);
  if (isCollectionType(p.type) && inner && omModel.classes[inner]) return inner;
  if (isDictType(p.type) && inner && omModel.classes[inner]) return inner;
  if (omModel.classes[p.type]) return p.type;
  return null;
}
function refTypeDisplay(p: OmProp): string {
  const inner = resolveCollectionType(p.type);
  if (isCollectionType(p.type) && inner) return inner + "[]";
  if (isDictType(p.type) && inner) return inner + "{}";
  return shortType(p.type);
}
function refTypeLink(p: OmProp): { name: string; kind: string } | null {
  const inner = resolveCollectionType(p.type);
  if (isCollectionType(p.type) && inner && (omModel.classes[inner] || omModel.enums[inner])) {
    return { name: inner, kind: omModel.classes[inner] ? "class" : "enum" };
  }
  if (isDictType(p.type) && inner && omModel.classes[inner]) return { name: inner, kind: "class" };
  if (omModel.classes[p.type]) return { name: p.type, kind: "class" };
  if (omModel.enums[p.type]) return { name: p.type, kind: "enum" };
  return null;
}
function refPropPath(p: OmProp): string {
  const paths = findPaths(refClass.value!.name);
  const base = paths.length > 0 ? paths[0] : pascalToCamel(refClass.value!.name);
  return (base ? base + (isCollectionType(p.type) || isDictType(p.type) ? "[0]." : ".") : "") + p.name;
}
function findPaths(targetClassName: string): Array<string> {
  const root = omModel.classes["ObjectModel"];
  if (!root || !omModel.classes[targetClassName]) return [];
  const direct: Record<string, Set<string>> = {};
  for (const cls of Object.values(omModel.classes)) {
    if (cls.parent) {
      if (!direct[cls.parent]) direct[cls.parent] = new Set();
      direct[cls.parent].add(cls.name);
    }
  }
  const subMap: Record<string, Set<string>> = {};
  const getAll = (name: string): Set<string> => {
    if (subMap[name]) return subMap[name];
    subMap[name] = new Set();
    for (const child of (direct[name] || [])) {
      subMap[name].add(child);
      for (const g of getAll(child)) subMap[name].add(g);
    }
    return subMap[name];
  };
  for (const n of Object.keys(direct)) getAll(n);
  const results = new Set<string>();
  const visited = new Set<string>();
  const walk = (cls: OmClass, soFar: string) => {
    const key = cls.name + "|" + soFar;
    if (visited.has(key)) return;
    visited.add(key);
    if (cls.name === targetClassName && soFar) { results.add(soFar); return; }
    for (const prop of cls.props || []) {
      const inner = resolveCollectionType(prop.type);
      const tt = (inner || prop.type).replace(/\s*\|\s*null/g, "").trim();
      if (!omModel.classes[tt]) continue;
      const suffix = isCollectionType(prop.type) ? "[]" : isDictType(prop.type) ? "{}" : "";
      const seg = soFar ? soFar + "." + prop.name + suffix : prop.name + suffix;
      const toWalk = new Set<string>([tt]);
      for (const sub of (subMap[tt] || [])) toWalk.add(sub);
      for (const n of toWalk) { const c = omModel.classes[n]; if (c) walk(c, seg); }
    }
  };
  walk(root, "");
  return [...results].sort();
}

// ── Value formatting ──────────────────────────────────────────
function fmtLive(val: unknown): string {
  if (val === undefined) return "—";
  if (val === null) return "null";
  if (typeof val === "boolean") return String(val);
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return '"' + val + '"';
  if (Array.isArray(val)) return "[" + val.length + " items]";
  if (val instanceof Map) return "{map " + val.size + "}";
  return "{object}";
}
function liveValClass(val: unknown): string {
  if (val === null || val === undefined) return "live-val--null";
  if (val === true) return "live-val--true";
  if (val === false) return "live-val--false";
  return "";
}

// ── Copy / export ─────────────────────────────────────────────
function copyText(text: string, titleKey: string): void {
  const done = () => uiStore.makeNotification(LogLevel.success, t(titleKey), text, 1500);
  // navigator.clipboard is unreliable on a Duet served over plain HTTP, so try execCommand first.
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    done();
  } catch (e) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => { /* ignore */ });
  }
}
function copyPath(path: string | null): void { if (path) copyText(path, "plugins.omBrowser.copiedPath"); }
function jsonFor(path: string | null): string {
  const val = path ? resolvePath(liveRoot(), path) : liveRoot();
  try { return JSON.stringify(val, mapReplacer, 2); } catch (e) { return String(val); }
}
function mapReplacer(_key: string, value: unknown): unknown {
  return value instanceof Map ? Object.fromEntries(value as Map<string, unknown>) : value;
}
function copyJson(path: string | null): void { copyText(jsonFor(path), "plugins.omBrowser.copiedJson"); }
function downloadJson(path: string | null): void {
  const name = (path || "objectModel").replace(/[^a-zA-Z0-9]+/g, "_");
  const blob = new Blob([jsonFor(path)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function copyLink(path: string | null): void {
  const url = new URL(window.location.href);
  if (path) url.searchParams.set("path", path); else url.searchParams.delete("path");
  copyText(url.href, "plugins.omBrowser.copiedLink");
}

// ── Deep-linking (?path=) ─────────────────────────────────────
function syncQuery(): void {
  const path = detailMode.value === "live" ? selectedNode.value : null;
  const current = typeof route.query.path === "string" ? route.query.path : undefined;
  if ((path || undefined) === current) return;
  router.replace({ query: { ...route.query, path: path || undefined } }).catch(() => { /* navigation duplicate */ });
}

// ── Keyboard navigation in the tree ───────────────────────────
function onTreeKey(e: KeyboardEvent): void {
  if (e.key === "Escape") { searchTerm.value = ""; return; }
  if (debouncedSearch.value.trim()) return; // arrow nav only in the hierarchical tree
  const rows = treeRows.value;
  if (!rows.length) return;
  let idx = rows.findIndex((r) => r.id === treeHighlight.value);
  const row = idx >= 0 ? rows[idx] : null;
  switch (e.key) {
    case "ArrowDown": e.preventDefault(); idx = Math.min(rows.length - 1, idx + 1); selectRow(rows[Math.max(0, idx)]); scrollTreeHighlight(); break;
    case "ArrowUp": e.preventDefault(); idx = idx <= 0 ? 0 : idx - 1; selectRow(rows[idx]); scrollTreeHighlight(); break;
    case "ArrowRight": if (row && row.hasChildren && !openNodes[row.id]) { e.preventDefault(); toggleNode(row); } break;
    case "ArrowLeft":
      if (row && row.hasChildren && openNodes[row.id]) { e.preventDefault(); openNodes[row.id] = false; }
      else if (row) { const par = parentPath(row.id); if (par) { e.preventDefault(); treeHighlight.value = par; scrollTreeHighlight(); } }
      break;
    case "Enter": if (row) { e.preventDefault(); selectRow(row); } break;
    default: break;
  }
}

// ── Resize ────────────────────────────────────────────────────
let resizing = false;
let resizeStartX = 0;
let resizeStartW = 340;
function startResize(e: MouseEvent): void {
  resizing = true;
  resizeStartX = e.clientX;
  resizeStartW = treeWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}
function onMouseMove(e: MouseEvent): void {
  if (!resizing) return;
  treeWidth.value = Math.max(160, Math.min(700, resizeStartW + e.clientX - resizeStartX));
}
function onMouseUp(): void {
  if (!resizing) return;
  resizing = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

// ── Lifecycle ─────────────────────────────────────────────────
let tickTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  // Throttled live refresh (~4/sec) while connected; reference mode is static.
  tickTimer = setInterval(() => { if (machineStore.isConnected) modelTick.value++; }, 250);
  // Deep-link: open the requested path on load.
  const p = route.query.path;
  if (typeof p === "string" && p) {
    if (machineStore.isConnected) revealLivePath(p);
    else if (omModel.classes[p]) selectSearchResult(p);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
  if (tickTimer) clearInterval(tickTimer);
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<style scoped>
/* Theme-aware: colours derive from the active Vuetify theme so the browser follows light/dark. */
.om-browser { font-size: 13px; }

.om-status {
  display: flex; align-items: center; gap: 8px; height: 24px; padding: 0 16px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.om-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.om-dot--live { background: rgb(var(--v-theme-success)); }
.om-dot--off { background: rgba(var(--v-theme-on-surface), 0.4); }

.om-tree-col { display: flex; flex-direction: column; min-width: 160px; border-right: 1px solid rgba(var(--v-theme-on-surface), 0.12); overflow: hidden; }
.om-tree-scroll { flex: 1 1 auto; overflow-y: auto; outline: none; }
.om-tree-scroll:focus-visible { box-shadow: inset 0 0 0 2px rgba(var(--v-theme-primary), 0.4); }

.om-search-head {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6); padding: 6px 8px 2px;
}

.tree-row {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 8px; border-radius: 4px; cursor: pointer;
  font-size: 13px; user-select: none; min-height: 26px;
}
.tree-row:hover { background: rgba(var(--v-theme-on-surface), 0.06); }
.tree-row--selected { background: rgba(var(--v-theme-primary), 0.14); }
.tree-toggle { width: 14px; flex-shrink: 0; font-size: 9px; color: rgba(var(--v-theme-on-surface), 0.6); text-align: center; }
.tree-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-type { font-size: 11px; color: rgba(var(--v-theme-on-surface), 0.6); margin-left: auto; padding-left: 8px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }

.om-watch { flex-shrink: 0; max-height: 35%; overflow-y: auto; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12); background: rgba(var(--v-theme-on-surface), 0.03); }
.om-watch-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; color: rgba(var(--v-theme-on-surface), 0.6); padding: 6px 8px 2px; display: flex; align-items: center; }
.om-watch-row { display: flex; align-items: center; gap: 6px; padding: 2px 6px 2px 8px; cursor: pointer; font-size: 12px; }
.om-watch-row:hover { background: rgba(var(--v-theme-on-surface), 0.06); }
.om-watch-path { font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; }
.om-watch-val { font-family: monospace; flex-shrink: 0; }

.resizer { width: 5px; background: transparent; cursor: col-resize; flex-shrink: 0; }
.resizer:hover { background: rgba(var(--v-theme-primary), 0.4); }

.om-path-code {
  font-family: monospace; font-size: 12px; color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.08); border: 1px solid rgba(var(--v-theme-warning), 0.25);
  border-radius: 4px; padding: 2px 8px;
}
.class-desc {
  font-size: 13px; line-height: 1.6;
  background: rgba(var(--v-theme-primary), 0.06); border-left: 3px solid rgb(var(--v-theme-primary));
  padding: 8px 12px; border-radius: 0 4px 4px 0;
}

/* Flat detail table */
.detail-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.detail-table th {
  text-align: left; font-size: 11px; font-weight: 600; color: rgba(var(--v-theme-on-surface), 0.6);
  padding: 4px 8px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12); white-space: nowrap;
}
.detail-table td { padding: 5px 8px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08); vertical-align: top; }
.detail-table tr:last-child td { border-bottom: none; }
.detail-table tbody tr:hover td { background: rgba(var(--v-theme-on-surface), 0.04); }
.detail-table .row-drilldown { cursor: pointer; }
.detail-table .row-drilldown:hover td { background: rgba(var(--v-theme-primary), 0.06) !important; }

.prop-name-cell { display: flex; align-items: center; }
.dtoggle { width: 14px; font-size: 9px; color: rgba(var(--v-theme-on-surface), 0.6); text-align: center; flex-shrink: 0; }

.prop-table { width: 100%; background: transparent; }
.prop-name { font-family: monospace; font-weight: 500; }
.prop-name--readonly { color: rgb(var(--v-theme-secondary)); }
.prop-type { font-family: monospace; color: rgb(var(--v-theme-info)); font-size: 12px; }
.prop-type--link { cursor: pointer; text-decoration: underline dotted; }
.prop-type--link:hover { color: rgb(var(--v-theme-primary)); }
.prop-default { font-family: monospace; font-size: 12px; color: rgb(var(--v-theme-warning)); background: none; }
.enum-key { font-family: monospace; color: rgb(var(--v-theme-success)); }
.desc-cell { font-size: 12px; line-height: 1.5; max-width: 300px; }

.tag { font-size: 10px; border-radius: 3px; padding: 1px 5px; font-weight: 500; }
.tag-sbc-only { background: rgba(var(--v-theme-warning), 0.18); color: rgb(var(--v-theme-warning)); }
.tag-sbc { background: rgba(var(--v-theme-info), 0.15); color: rgb(var(--v-theme-info)); }

.enum-pip {
  font-family: monospace; font-size: 11px; color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.1); border: 1px solid rgba(var(--v-theme-success), 0.25);
  border-radius: 3px; padding: 1px 5px;
}

.live-val { font-family: monospace; font-size: 12px; }
.live-val--null { color: rgba(var(--v-theme-on-surface), 0.5); }
.live-val--true { color: rgb(var(--v-theme-success)); }
.live-val--false { color: rgb(var(--v-theme-error)); }
</style>
