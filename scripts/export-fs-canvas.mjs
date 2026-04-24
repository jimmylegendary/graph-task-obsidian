#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const projectRoot = process.argv[2];
if (!projectRoot) {
  console.error('Usage: node scripts/export-fs-canvas.mjs <project-root>');
  process.exit(1);
}

function findVaultRoot(start) {
  let current = start;
  while (true) {
    const obsidianDir = join(current, '.obsidian');
    if (statSync(obsidianDir, { throwIfNoEntry: false })?.isDirectory()) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error(`Could not find vault root above ${start}`);
    current = parent;
  }
}

const vaultRoot = findVaultRoot(projectRoot);

const COLORS = {
  project: '#94A3B8',
  step: '#F59E0B',
  phase: '#60A5FA',
  node: '#10B981',
  result: '#64748B',
  diverge: '#3B82F6',
  converge: '#8B5CF6',
  verify: '#14B8A6',
  commit: '#F43F5E',
};

function parseFrontmatter(path) {
  const content = readFileSync(path, 'utf8');
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---', 4);
  if (end === -1) return null;
  const yaml = content.slice(4, end);
  const fm = {};
  let lastKey = null;
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    const keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (keyMatch) {
      lastKey = keyMatch[1];
      let value = keyMatch[2];
      if (value === '') value = null;
      else if (/^\d+$/.test(value)) value = Number(value);
      fm[lastKey] = value;
      continue;
    }
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && lastKey) {
      if (!Array.isArray(fm[lastKey])) fm[lastKey] = [];
      fm[lastKey].push(listMatch[1]);
    }
  }
  return fm;
}

function entityFromIndex(folder, expectedType) {
  const indexPath = join(folder, 'index.md');
  const fm = parseFrontmatter(indexPath);
  if (!fm || fm.entityType !== expectedType) throw new Error(`Expected ${expectedType} index at ${indexPath}`);
  return {
    type: expectedType,
    id: fm.id || basename(folder),
    title: fm.title || fm.id || basename(folder),
    status: fm.status || 'unknown',
    frontmatter: fm,
    file: { path: relative(vaultRoot, indexPath).replace(/\\/g, '/') },
    children: [],
  };
}

function entityFromFile(path, expectedType) {
  const fm = parseFrontmatter(path);
  if (!fm || fm.entityType !== expectedType) throw new Error(`Expected ${expectedType} file at ${path}`);
  return {
    type: expectedType,
    id: fm.id || basename(path, '.md'),
    title: fm.title || fm.id || basename(path, '.md'),
    status: fm.status || 'unknown',
    frontmatter: fm,
    file: { path: relative(vaultRoot, path).replace(/\\/g, '/') },
    children: [],
  };
}

function listDirs(folder) {
  return readdirSync(folder).map((name) => join(folder, name)).filter((p) => statSync(p).isDirectory()).sort();
}
function listMd(folder) {
  return readdirSync(folder).map((name) => join(folder, name)).filter((p) => p.endsWith('.md') && basename(p) !== 'index.md').sort();
}

function loadProject(root) {
  const project = entityFromIndex(root, 'project');
  for (const stepDir of listDirs(join(root, 'steps'))) {
    const step = entityFromIndex(stepDir, 'step');
    for (const phaseDir of listDirs(join(stepDir, 'phases'))) {
      const phase = entityFromIndex(phaseDir, 'phase');
      const nodesDir = join(phaseDir, 'nodes');
      const resultsDir = join(phaseDir, 'results');
      if (statSync(nodesDir, { throwIfNoEntry: false })) {
        for (const nodePath of listMd(nodesDir)) phase.children.push(entityFromFile(nodePath, 'node'));
      }
      if (statSync(resultsDir, { throwIfNoEntry: false })) {
        for (const resultPath of listMd(resultsDir)) phase.children.push(entityFromFile(resultPath, 'result'));
      }
      step.children.push(phase);
    }
    project.children.push(step);
  }
  return project;
}

function fileNode(entity, x, y, color, size) {
  return { id: `${entity.type}-${entity.id}-${entity.file.path.replace(/[^a-zA-Z0-9_-]/g, '-')}`, type: 'file', file: entity.file.path, x, y, width: size[0], height: size[1], color };
}
function groupNode(id, label, x, y, width, height, color) {
  return { id, type: 'group', label, x, y, width, height, color };
}
function edge(fromNode, toNode, color, label) {
  return { id: `${fromNode}--${toNode}`, fromNode, fromSide: 'right', toNode, toSide: 'left', toEnd: 'arrow', color, label };
}
function splitChildren(phase) {
  return { nodes: phase.children.filter((c) => c.type === 'node'), results: phase.children.filter((c) => c.type === 'result') };
}
function phaseColor(phase) {
  return COLORS[phase.frontmatter.phaseType] || COLORS.phase;
}

function stepCanvas(project) {
  const nodes = [];
  const edges = [];
  const projectNode = fileNode(project, 0, 0, COLORS.project, [320, 100]);
  nodes.push(projectNode);
  let prevStep = null;
  project.children.forEach((step, i) => {
    const stepX = i * 860;
    const stepY = 220;
    const group = groupNode(`group-${step.id}`, `${step.id} · ${step.status}`, stepX - 24, stepY - 24, Math.max(720, step.children.length * 260 + 120), 520, COLORS.step);
    nodes.push(group);
    const stepNode = fileNode(step, stepX, stepY, COLORS.step, [260, 90]);
    nodes.push(stepNode);
    edges.push(edge(projectNode.id, stepNode.id, COLORS.step, 'step'));
    if (prevStep) edges.push(edge(prevStep.id, stepNode.id, COLORS.project, 'next'));
    prevStep = stepNode;
    step.children.forEach((phase, j) => {
      const phaseX = stepX + 12 + j * 260;
      const phaseY = stepY + 140;
      const phaseNode = fileNode(phase, phaseX, phaseY, phaseColor(phase), [240, 84]);
      nodes.push(phaseNode);
      edges.push(edge(stepNode.id, phaseNode.id, phaseColor(phase), phase.frontmatter.phaseType || 'phase'));
      const { nodes: phaseNodes, results } = splitChildren(phase);
      phaseNodes.forEach((nodeEntity, idx) => {
        const nodeNode = fileNode(nodeEntity, phaseX, phaseY + 140 + idx * 112, COLORS.node, [220, 78]);
        nodes.push(nodeNode);
        edges.push(edge(phaseNode.id, nodeNode.id, COLORS.node, 'node'));
      });
      results.forEach((resultEntity, idx) => {
        const resultNode = fileNode(resultEntity, phaseX + 230, phaseY + 140 + idx * 88, COLORS.result, [200, 72]);
        nodes.push(resultNode);
        edges.push(edge(phaseNode.id, resultNode.id, COLORS.result, 'result'));
      });
    });
  });
  return { nodes, edges };
}

function phaseCanvas(project) {
  const nodes = [];
  const edges = [];
  const projectNode = fileNode(project, 0, 0, COLORS.project, [320, 100]);
  nodes.push(projectNode);
  let phaseCol = 0;
  project.children.forEach((step, row) => {
    const y = 220 + row * 420;
    const stepNode = fileNode(step, 0, y, COLORS.step, [260, 90]);
    nodes.push(stepNode);
    edges.push(edge(projectNode.id, stepNode.id, COLORS.step, 'step'));
    step.children.forEach((phase) => {
      const x = 360 + phaseCol * 300;
      const phaseNode = fileNode(phase, x, y, phaseColor(phase), [240, 84]);
      nodes.push(phaseNode);
      edges.push(edge(stepNode.id, phaseNode.id, phaseColor(phase), phase.frontmatter.phaseType || 'phase'));
      const { nodes: phaseNodes, results } = splitChildren(phase);
      phaseNodes.forEach((nodeEntity, idx) => {
        const nodeNode = fileNode(nodeEntity, x, y + 160 + idx * 112, COLORS.node, [220, 78]);
        nodes.push(nodeNode);
        edges.push(edge(phaseNode.id, nodeNode.id, COLORS.node, 'node'));
      });
      results.forEach((resultEntity, idx) => {
        const resultNode = fileNode(resultEntity, x + 240, y + 160 + idx * 88, COLORS.result, [200, 72]);
        nodes.push(resultNode);
        edges.push(edge(phaseNode.id, resultNode.id, COLORS.result, 'result'));
      });
      phaseCol += 1;
    });
  });
  return { nodes, edges };
}

function nodeCanvas(project) {
  const nodes = [];
  const edges = [];
  const projectNode = fileNode(project, 0, 0, COLORS.project, [320, 100]);
  nodes.push(projectNode);
  project.children.forEach((step, col) => {
    const stepX = col * 520;
    const stepY = 220;
    const stepNode = fileNode(step, stepX, stepY, COLORS.step, [260, 90]);
    nodes.push(stepNode);
    edges.push(edge(projectNode.id, stepNode.id, COLORS.step, 'step'));
    step.children.forEach((phase, idx) => {
      const phaseY = stepY + 160 + idx * 280;
      const phaseNode = fileNode(phase, stepX, phaseY, phaseColor(phase), [240, 84]);
      nodes.push(phaseNode);
      edges.push(edge(stepNode.id, phaseNode.id, phaseColor(phase), phase.frontmatter.phaseType || 'phase'));
      const { nodes: phaseNodes, results } = splitChildren(phase);
      phaseNodes.forEach((nodeEntity, nodeIdx) => {
        const nodeX = stepX + 300 + nodeIdx * 260;
        const nodeNode = fileNode(nodeEntity, nodeX, phaseY, COLORS.node, [220, 78]);
        nodes.push(nodeNode);
        edges.push(edge(phaseNode.id, nodeNode.id, COLORS.node, 'node'));
        results.filter((r) => r.frontmatter.nodeId === nodeEntity.id).forEach((resultEntity, resultIdx) => {
          const resultNode = fileNode(resultEntity, nodeX, phaseY + 132 + resultIdx * 88, COLORS.result, [200, 72]);
          nodes.push(resultNode);
          edges.push(edge(nodeNode.id, resultNode.id, COLORS.result, 'result'));
        });
      });
    });
  });
  return { nodes, edges };
}

const project = loadProject(projectRoot);
const outDir = join(projectRoot, 'canvases');
mkdirSync(outDir, { recursive: true });
const outputs = {
  step: stepCanvas(project),
  phase: phaseCanvas(project),
  node: nodeCanvas(project),
};
for (const [mode, data] of Object.entries(outputs)) {
  const outPath = join(outDir, `${project.id}-${mode}-view.canvas`);
  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');
  console.log(outPath);
}
