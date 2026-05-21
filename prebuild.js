#!/usr/bin/env node
/**
 * Prebuild script for OmBrowser DWC plugin.
 * Reads local ObjectModel TypeScript sources from om-src/ + fetches DSF C# XML docs from GitHub,
 * runs the same parse logic as the standalone viewer, and writes the result as
 * src/model-data.js for bundling into the plugin at build time.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Config ────────────────────────────────────────────────────
const OM_REF = 'v3.6-dev';
const DSF_REF = 'v3.6-dev';
const DSF_REPO = 'Duet3D/DuetSoftwareFramework';
const DSF_OM_PATH = 'src/DuetAPI/ObjectModel';
const OM_SRC_DIR = path.resolve(__dirname, 'om-src');
const OUT_FILE = path.resolve(__dirname, 'src/model-data.js');

// ── HTTP helper ───────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'OmBrowser-prebuild' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
  });
}

function fetchJSON(url) {
  return fetchUrl(url).then(JSON.parse);
}

// ── TypeScript parser (from viewer/index.html) ────────────────
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
    .replace(/\/\/[^\n]*/g, '');
}

function parseOMFile(src, filePath) {
  const clean = stripComments(src);
  const classes = {};
  const enums = {};

  const enumRe = /export\s+(?:const\s+)?enum\s+(\w+)\s*\{([^}]*)\}/g;
  let m;
  while ((m = enumRe.exec(clean)) !== null) {
    const name = m[1];
    const body = m[2];
    const members = [];
    const memberRe = /(\w+)\s*(?:=\s*([^,\n}]+))?/g;
    let mm;
    while ((mm = memberRe.exec(body)) !== null) {
      if (!mm[1]) continue;
      members.push({ key: mm[1], value: mm[2] ? mm[2].trim() : undefined });
    }
    if (members.length > 0) enums[name] = { name, members, file: filePath };
  }

  const classRe = /export\s+class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
  while ((m = classRe.exec(clean)) !== null) {
    const name = m[1];
    const parent = m[2] || null;
    const startIdx = m.index + m[0].length;
    let depth = 1, i = startIdx;
    while (i < clean.length && depth > 0) {
      if (clean[i] === '{') depth++;
      else if (clean[i] === '}') depth--;
      i++;
    }
    const body = clean.slice(startIdx, i - 1);
    const props = parseClassBody(body);
    if (props.length > 0 || name !== 'ModelObject') {
      classes[name] = { name, parent, props, file: filePath };
    }
  }

  return { classes, enums };
}

function parseClassBody(body) {
  const props = [];
  const ctorRe = /constructor\s*\([^)]*\)\s*\{/g;
  let cleaned = body;
  let m;
  while ((m = ctorRe.exec(cleaned)) !== null) {
    const start = m.index;
    let depth = 1, i = start + m[0].length;
    while (i < cleaned.length && depth > 0) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') depth--;
      i++;
    }
    cleaned = cleaned.slice(0, start) + cleaned.slice(i);
    ctorRe.lastIndex = start;
  }

  const propRe = /^\s*(readonly\s+)?(\w+)\s*:\s*([^=;\n]+?)\s*(?:=\s*([^;\n]+?))?\s*;/gm;
  while ((m = propRe.exec(cleaned)) !== null) {
    const readonly = !!m[1];
    const name = m[2];
    if (['constructor', 'super', 'return', 'this', 'static'].includes(name)) continue;
    const typeStr = m[3].trim().replace(/\s+/g, ' ');
    const defaultVal = m[4] ? m[4].trim() : undefined;
    const nullable = typeStr.includes('| null') || typeStr.includes('null |');
    const cleanType = typeStr.replace(/\s*\|\s*null/g, '').replace(/null\s*\|\s*/g, '').trim();
    props.push({ name, type: cleanType, nullable, readonly, default: defaultVal });
  }

  return props;
}

// ── DSF C# XML doc parser (from viewer/index.html) ───────────
function pascalToCamel(s) {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function extractXmlTag(text, tag) {
  const re = new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  const m = text.match(re);
  if (!m) return null;
  return m[1].replace(/\s+/g, ' ').trim();
}

function parseDSFFile(src) {
  const result = {};
  const lines = src.split('\n');
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('///')) {
      const docParts = [];
      while (i < lines.length && lines[i].trim().startsWith('///')) {
        docParts.push(lines[i].trim().replace(/^\/\/\/\s?/, ''));
        i++;
      }
      const docBlock = docParts.join(' ');
      const summary = extractXmlTag(docBlock, 'summary');
      const remarks = extractXmlTag(docBlock, 'remarks');
      if (!summary) continue;

      let j = i;
      let sbcProperty = null;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (t === '') { j++; continue; }
        if (t.startsWith('[')) {
          const sbcM = t.match(/^\[SbcProperty\(\s*(true|false)\s*\)\]/);
          if (sbcM) sbcProperty = sbcM[1] === 'true';
          j++; continue;
        }
        break;
      }
      if (j >= lines.length) continue;

      const declBlock = lines.slice(j, j + 3).map(l => l.trim()).join(' ');

      const classMatch = declBlock.match(/^public\s+(?:(?:partial|abstract|sealed|static)\s+)*class\s+(\w+)/);
      if (classMatch) {
        const name = classMatch[1];
        if (!result[name]) result[name] = {};
        result[name].__class__ = { summary, remarks };
        continue;
      }

      const enumMatch = declBlock.match(/^public\s+enum\s+(\w+)/);
      if (enumMatch) {
        const name = enumMatch[1];
        if (!result[name]) result[name] = {};
        result[name].__class__ = { summary, remarks };
        continue;
      }

      const propMatch = declBlock.match(/^public\s+(?:(?:static|virtual|override|new|readonly)\s+)*[\w?<>[\],\s]+?\s+(\w+)\s*(?:\{|=>)/);
      if (propMatch) {
        const propName = propMatch[1];
        if (propName === 'class' || propName === 'enum') continue;
        const enclosing = findEnclosingType(lines, j);
        if (enclosing) {
          if (!result[enclosing]) result[enclosing] = {};
          const entry = { summary, remarks };
          if (sbcProperty !== null) entry.sbcProperty = sbcProperty;
          result[enclosing][pascalToCamel(propName)] = entry;
        }
        continue;
      }

      const enumMemberMatch = declBlock.match(/^(\w+)\s*(?:=\s*-?\d+)?\s*,?(?:\s|$)/);
      if (enumMemberMatch) {
        const memberName = enumMemberMatch[1];
        if (/^(public|private|protected|internal|static|readonly|namespace|using|return|void|class|enum|if|for|new)$/.test(memberName)) continue;
        const enclosing = findEnclosingType(lines, j);
        if (enclosing) {
          if (!result[enclosing]) result[enclosing] = {};
          result[enclosing][pascalToCamel(memberName)] = { summary };
          result[enclosing][memberName] = { summary };
        }
      }
      continue;
    }
    i++;
  }
  return result;
}

function findEnclosingType(lines, fromLine) {
  let depth = 0;
  for (let i = fromLine - 1; i >= 0; i--) {
    const t = lines[i].trim();
    for (let c = t.length - 1; c >= 0; c--) {
      if (t[c] === '}') depth++;
      else if (t[c] === '{') {
        if (depth > 0) { depth--; }
        else {
          for (let k = i; k >= Math.max(0, i - 4); k--) {
            const decl = lines[k].trim();
            const cm = decl.match(/(?:public|internal|private)\s+(?:(?:partial|abstract|sealed|static)\s+)*class\s+(\w+)/);
            if (cm) return cm[1];
            const em = decl.match(/(?:public|internal|private)\s+enum\s+(\w+)/);
            if (em) return em[1];
          }
          return null;
        }
      }
    }
  }
  return null;
}

function mergeDSFDocs(target, parsed) {
  for (const [name, props] of Object.entries(parsed)) {
    if (!target[name]) target[name] = {};
    Object.assign(target[name], props);
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const model = { classes: {}, enums: {} };
  const descriptions = {};

  // 1. Parse all local TypeScript source files
  console.log(`Parsing ObjectModel TypeScript sources from ${OM_SRC_DIR} ...`);
  const tsFiles = [];
  function walkDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(full);
      else if (entry.name.endsWith('.ts')) tsFiles.push(full);
    }
  }
  walkDir(OM_SRC_DIR);
  console.log(`  Found ${tsFiles.length} .ts files`);
  for (const f of tsFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(OM_SRC_DIR, f).replace(/\\/g, '/');
    const parsed = parseOMFile(src, rel);
    Object.assign(model.classes, parsed.classes);
    Object.assign(model.enums, parsed.enums);
  }
  console.log(`  Parsed ${Object.keys(model.classes).length} classes, ${Object.keys(model.enums).length} enums`);

  // 2. Fetch DSF C# XML doc files from GitHub
  console.log(`Fetching DSF C# docs from GitHub (${DSF_REPO}@${DSF_REF}) ...`);
  const treeUrl = `https://api.github.com/repos/${DSF_REPO}/git/trees/${DSF_REF}?recursive=1`;
  const tree = await fetchJSON(treeUrl);
  const csFiles = tree.tree
    .filter(f => f.path.startsWith(DSF_OM_PATH + '/') && f.path.endsWith('.cs'))
    .map(f => f.path);
  console.log(`  Found ${csFiles.length} .cs files`);

  for (const filePath of csFiles) {
    const url = `https://raw.githubusercontent.com/${DSF_REPO}/${DSF_REF}/${filePath}`;
    process.stdout.write(`  ${path.basename(filePath)} ... `);
    try {
      const src = await fetchUrl(url);
      mergeDSFDocs(descriptions, parseDSFFile(src));
      console.log('ok');
    } catch (e) {
      console.log(`FAILED (${e.message})`);
    }
  }
  console.log(`  Descriptions for ${Object.keys(descriptions).length} types`);

  // 3. Write output module
  const output = `// AUTO-GENERATED by dwc-plugin/prebuild.js — do not edit manually
// ObjectModel ref: ${OM_REF}  DSF ref: ${DSF_REF}
// Generated: ${new Date().toISOString()}

export const MODEL_REF = ${JSON.stringify(OM_REF)};
export const DSF_REF_LABEL = ${JSON.stringify(DSF_REF)};
export const omModel = ${JSON.stringify(model, null, 2)};
export const omDescriptions = ${JSON.stringify(descriptions, null, 2)};
`;

  fs.writeFileSync(OUT_FILE, output, 'utf8');
  const kb = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`\nWrote ${OUT_FILE} (${kb} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
