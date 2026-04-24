# graph-task Obsidian plugin MVP

This is the first tree-first Obsidian plugin for the md-first `graph-task` direction.

## What it does
- scans the current vault for graph-task projects
- detects a project when a folder contains `index.md` with `entityType: project`
- renders a side-panel tree:
  - Project
  - Step
  - Phase
  - Node
  - Result
- shows compact badges for status, phase type, result count, and validation issues
- lets you click an item to open the canonical markdown file
- includes a refresh command / button
- exports semantic Obsidian canvas views for active or all graph-task projects
- shows a validation issue panel instead of failing silently when structure is broken

## Current scope
This MVP is intentionally read-only.

Included:
- parse md-first project structure
- inspect the tree in Obsidian
- open canonical markdown files
- refresh the parsed state
- export deterministic step / phase / node canvas views
- surface validation issues

Not included yet:
- create or edit entities from the plugin
- lock / lease handling
- fully live graph workspace with rich filters
- conflict resolution
- rich detail pane

## Build
From this plugin folder:

```bash
npm install
npm run typecheck
npm run build
```

## Smoke tests
From this plugin folder:

```bash
node scripts/smoke-parse.mjs
npm run smoke:canvas
```

Expected output includes:
- `project: project-alpha`
- `step: step-1`
- `phase: phase-diverge-1`
- `node: node-compare-layout`
- `result: result-0001`
- canvas file paths under `vault/graph-task-demo/project-canvas-workgraph/canvases/`
- final parse line: `OK: projects=1 steps=1 phases=1 nodes=1 results=1`

## Load into Obsidian
### Option A — use the sample vault directly
1. Open Obsidian.
2. Choose **Open folder as vault**.
3. Select `examples/md-first-minimal/` from this repo.
4. Create the community plugin folder inside that vault if needed:
   - `<vault>/.obsidian/plugins/graph-task-obsidian/`
5. Copy these plugin files into that folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`
6. In Obsidian:
   - Settings → Community plugins
   - turn off Restricted mode
   - enable **Graph-Task Explorer**
7. Click the ribbon icon or run the command:
   - `Graph-Task Explorer: Open project explorer`

### Option B — use your real vault
If your real vault contains md-first graph-task project folders with the same structure, install the plugin the same way and open the explorer.

## Export canvas views in Obsidian
After enabling the plugin, you can run either of these commands:
- `Graph-Task Explorer: Export canvas views for active project`
- `Graph-Task Explorer: Export canvas views for all projects`

For each project, the plugin writes three derived canvas files:
- `<project-id>-step-view.canvas`
- `<project-id>-phase-view.canvas`
- `<project-id>-node-view.canvas`

These are derived visualization artifacts. Markdown remains canonical.

## Expected first visual result in Obsidian
If you load `examples/md-first-minimal/`, the plugin should show a tree roughly like:

```text
project: project-alpha [active]
  step: step-1 [active]
    phase: phase-diverge-1 [done] [diverge] [1 result]
      node: node-compare-layout [done]
      result: result-0001 [done]
```

When you click each row, Obsidian should open the corresponding canonical markdown note.

## Validation behavior
The plugin currently flags issues such as:
- missing required frontmatter
- wrong `entityType`
- id mismatch with folder/file name
- missing `steps/` folder on a project
- multiple commit phases inside one step
- result missing `nodeId`

## Next likely steps
- detail pane for selected entity
- create entity commands
- status mutation commands
- live filterable work-graph view beyond export-only canvases
- validator shared with CLI/runtime
- lightweight lock / lease awareness
