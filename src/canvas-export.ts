import { Notice, TFile, normalizePath, type App } from 'obsidian';
import type { Entity } from './parser';

export type CanvasColor = string;

export interface CanvasNodeData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
  [key: string]: unknown;
}

export interface CanvasFileData extends CanvasNodeData {
  type: 'file';
  file: string;
  subpath?: string;
}

export interface CanvasGroupData extends CanvasNodeData {
  type: 'group';
  label?: string;
  background?: string;
  backgroundStyle?: 'cover' | 'ratio' | 'repeat';
}

export interface CanvasEdgeData {
  id: string;
  fromNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  fromEnd?: 'none' | 'arrow';
  toNode: string;
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  toEnd?: 'none' | 'arrow';
  color?: CanvasColor;
  label?: string;
  [key: string]: unknown;
}

export interface CanvasData {
  nodes: Array<CanvasFileData | CanvasGroupData>;
  edges: CanvasEdgeData[];
  [key: string]: unknown;
}

export type CanvasViewMode = 'step' | 'phase' | 'node';

const COLORS = {
  project: '#94A3B8',
  step: '#F59E0B',
  phase: '#60A5FA',
  node: '#10B981',
  result: '#64748B',
  active: '#2563EB',
  done: '#16A34A',
  blocked: '#DC2626',
  pending: '#94A3B8',
  cancelled: '#6B7280',
};

const FILE_WIDTH = {
  project: 320,
  step: 260,
  phase: 240,
  node: 220,
  result: 200,
} as const;

const FILE_HEIGHT = {
  project: 100,
  step: 90,
  phase: 84,
  node: 78,
  result: 72,
} as const;

const LAYOUT = {
  stepGapX: 860,
  phaseGapX: 260,
  sectionGapY: 140,
  nodeGapY: 112,
  resultGapY: 88,
  groupPad: 36,
};

interface CanvasExportResult {
  project: Entity;
  files: Array<{ mode: CanvasViewMode; path: string }>;
}

interface BuildContext {
  nodes: Array<CanvasFileData | CanvasGroupData>;
  edges: CanvasEdgeData[];
}

function entityKey(entity: Entity): string {
  return `${entity.type}-${entity.id}-${entity.file.path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function statusColor(status: string): CanvasColor {
  switch (status) {
    case 'active':
      return COLORS.active;
    case 'done':
      return COLORS.done;
    case 'blocked':
      return COLORS.blocked;
    case 'cancelled':
      return COLORS.cancelled;
    default:
      return COLORS.pending;
  }
}

function phaseColor(phase: Entity): CanvasColor {
  const phaseType = String(phase.frontmatter.phaseType ?? '');
  switch (phaseType) {
    case 'diverge':
      return '#3B82F6';
    case 'converge':
      return '#8B5CF6';
    case 'verify':
      return '#14B8A6';
    case 'commit':
      return '#F43F5E';
    default:
      return COLORS.phase;
  }
}

function labelFor(entity: Entity): string {
  const title = entity.title && entity.title !== entity.id ? `${entity.id}\n${entity.title}` : entity.id;
  if (entity.type === 'phase') {
    const phaseType = String(entity.frontmatter.phaseType ?? '');
    return `${title}\n${phaseType || 'phase'} · ${entity.status}`;
  }
  return `${title}\n${entity.status}`;
}

function fileNode(entity: Entity, x: number, y: number, color: CanvasColor): CanvasFileData {
  return {
    id: entityKey(entity),
    type: 'file',
    file: entity.file.path,
    x,
    y,
    width: FILE_WIDTH[entity.type],
    height: FILE_HEIGHT[entity.type],
    color,
  };
}

function groupNode(id: string, label: string, x: number, y: number, width: number, height: number, color: CanvasColor): CanvasGroupData {
  return {
    id,
    type: 'group',
    label,
    x,
    y,
    width,
    height,
    color,
  };
}

function edge(fromNode: string, toNode: string, color: CanvasColor, label?: string): CanvasEdgeData {
  return {
    id: `${fromNode}--${toNode}`,
    fromNode,
    fromSide: 'right',
    toNode,
    toSide: 'left',
    toEnd: 'arrow',
    color,
    label,
  };
}

function splitPhaseChildren(phase: Entity): { nodes: Entity[]; results: Entity[] } {
  return {
    nodes: phase.children.filter((child) => child.type === 'node'),
    results: phase.children.filter((child) => child.type === 'result'),
  };
}

function estimateStepGroupHeight(step: Entity): number {
  const phases = step.children;
  let tallest = FILE_HEIGHT.step + LAYOUT.sectionGapY + FILE_HEIGHT.phase;
  for (const phase of phases) {
    const { nodes, results } = splitPhaseChildren(phase);
    const nodeHeight = nodes.length > 0 ? FILE_HEIGHT.node + (nodes.length - 1) * LAYOUT.nodeGapY : 0;
    const resultHeight = results.length > 0 ? FILE_HEIGHT.result + (results.length - 1) * LAYOUT.resultGapY : 0;
    const laneHeight = FILE_HEIGHT.step + LAYOUT.sectionGapY + FILE_HEIGHT.phase + Math.max(nodeHeight, resultHeight) + 220;
    tallest = Math.max(tallest, laneHeight);
  }
  return tallest + LAYOUT.groupPad * 2;
}

function buildStepCanvas(project: Entity): CanvasData {
  const ctx: BuildContext = { nodes: [], edges: [] };
  const projectNode = fileNode(project, 0, 0, COLORS.project);
  ctx.nodes.push(projectNode);

  let previousStepNodeId: string | null = null;

  project.children.forEach((step, stepIndex) => {
    const stepX = stepIndex * LAYOUT.stepGapX;
    const stepY = 220;
    const phases = step.children;
    const groupHeight = estimateStepGroupHeight(step);
    const groupWidth = Math.max(720, phases.length * LAYOUT.phaseGapX + 140);
    const stepGroup = groupNode(`group-${entityKey(step)}`, `${step.id} · ${step.status}`, stepX - 28, stepY - 28, groupWidth, groupHeight, COLORS.step);
    ctx.nodes.push(stepGroup);

    const stepNode = fileNode(step, stepX, stepY, COLORS.step);
    ctx.nodes.push(stepNode);
    ctx.edges.push(edge(projectNode.id, stepNode.id, statusColor(step.status), 'step'));
    if (previousStepNodeId) {
      ctx.edges.push(edge(previousStepNodeId, stepNode.id, COLORS.project, 'next'));
    }
    previousStepNodeId = stepNode.id;

    phases.forEach((phase, phaseIndex) => {
      const phaseX = stepX + 12 + phaseIndex * LAYOUT.phaseGapX;
      const phaseY = stepY + LAYOUT.sectionGapY;
      const phaseNode = fileNode(phase, phaseX, phaseY, phaseColor(phase));
      ctx.nodes.push(phaseNode);
      ctx.edges.push(edge(stepNode.id, phaseNode.id, phaseColor(phase), String(phase.frontmatter.phaseType ?? 'phase')));

      const { nodes, results } = splitPhaseChildren(phase);
      nodes.forEach((nodeEntity, nodeIndex) => {
        const nodeNode = fileNode(nodeEntity, phaseX, phaseY + LAYOUT.sectionGapY + nodeIndex * LAYOUT.nodeGapY, COLORS.node);
        ctx.nodes.push(nodeNode);
        ctx.edges.push(edge(phaseNode.id, nodeNode.id, statusColor(nodeEntity.status), 'node'));
      });
      results.forEach((resultEntity, resultIndex) => {
        const resultX = phaseX + 230;
        const resultY = phaseY + LAYOUT.sectionGapY + resultIndex * LAYOUT.resultGapY;
        const resultNode = fileNode(resultEntity, resultX, resultY, COLORS.result);
        ctx.nodes.push(resultNode);
        ctx.edges.push(edge(phaseNode.id, resultNode.id, statusColor(resultEntity.status), 'result'));
      });
    });
  });

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function buildPhaseCanvas(project: Entity): CanvasData {
  const ctx: BuildContext = { nodes: [], edges: [] };
  const projectNode = fileNode(project, 0, 0, COLORS.project);
  ctx.nodes.push(projectNode);

  let phaseIndex = 0;
  project.children.forEach((step, stepRow) => {
    const rowY = 220 + stepRow * 420;
    const stepNode = fileNode(step, 0, rowY, COLORS.step);
    ctx.nodes.push(stepNode);
    ctx.edges.push(edge(projectNode.id, stepNode.id, COLORS.step, 'step'));

    step.children.forEach((phase) => {
      const phaseX = 360 + phaseIndex * 300;
      const phaseNode = fileNode(phase, phaseX, rowY, phaseColor(phase));
      ctx.nodes.push(phaseNode);
      ctx.edges.push(edge(stepNode.id, phaseNode.id, phaseColor(phase), String(phase.frontmatter.phaseType ?? 'phase')));

      const { nodes, results } = splitPhaseChildren(phase);
      nodes.forEach((nodeEntity, nodeIndex) => {
        const nodeNode = fileNode(nodeEntity, phaseX, rowY + 160 + nodeIndex * LAYOUT.nodeGapY, COLORS.node);
        ctx.nodes.push(nodeNode);
        ctx.edges.push(edge(phaseNode.id, nodeNode.id, statusColor(nodeEntity.status), 'node'));
      });
      results.forEach((resultEntity, resultIndex) => {
        const resultNode = fileNode(resultEntity, phaseX + 240, rowY + 160 + resultIndex * LAYOUT.resultGapY, COLORS.result);
        ctx.nodes.push(resultNode);
        ctx.edges.push(edge(phaseNode.id, resultNode.id, statusColor(resultEntity.status), 'result'));
      });
      phaseIndex += 1;
    });
  });

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function buildNodeCanvas(project: Entity): CanvasData {
  const ctx: BuildContext = { nodes: [], edges: [] };
  const projectNode = fileNode(project, 0, 0, COLORS.project);
  ctx.nodes.push(projectNode);

  let column = 0;
  project.children.forEach((step, stepIndex) => {
    const stepX = column * 520;
    const stepY = 220;
    const stepNode = fileNode(step, stepX, stepY, COLORS.step);
    ctx.nodes.push(stepNode);
    ctx.edges.push(edge(projectNode.id, stepNode.id, COLORS.step, 'step'));

    step.children.forEach((phase, phaseIndex) => {
      const phaseY = stepY + 160 + phaseIndex * 280;
      const phaseNode = fileNode(phase, stepX, phaseY, phaseColor(phase));
      ctx.nodes.push(phaseNode);
      ctx.edges.push(edge(stepNode.id, phaseNode.id, phaseColor(phase), String(phase.frontmatter.phaseType ?? 'phase')));

      const { nodes, results } = splitPhaseChildren(phase);
      nodes.forEach((nodeEntity, nodeIndex) => {
        const nodeX = stepX + 300 + nodeIndex * 260;
        const nodeNode = fileNode(nodeEntity, nodeX, phaseY, COLORS.node);
        ctx.nodes.push(nodeNode);
        ctx.edges.push(edge(phaseNode.id, nodeNode.id, statusColor(nodeEntity.status), 'node'));

        results
          .filter((resultEntity) => String(resultEntity.frontmatter.nodeId ?? '') === nodeEntity.id)
          .forEach((resultEntity, resultIndex) => {
            const resultNode = fileNode(resultEntity, nodeX, phaseY + 132 + resultIndex * LAYOUT.resultGapY, COLORS.result);
            ctx.nodes.push(resultNode);
            ctx.edges.push(edge(nodeNode.id, resultNode.id, statusColor(resultEntity.status), 'result'));
          });
      });
      const unmatchedResults = results.filter((resultEntity) => !nodes.some((nodeEntity) => String(resultEntity.frontmatter.nodeId ?? '') === nodeEntity.id));
      unmatchedResults.forEach((resultEntity, resultIndex) => {
        const resultNode = fileNode(resultEntity, stepX + 300, phaseY + 132 + resultIndex * LAYOUT.resultGapY, COLORS.result);
        ctx.nodes.push(resultNode);
        ctx.edges.push(edge(phaseNode.id, resultNode.id, statusColor(resultEntity.status), 'result'));
      });
    });
    column += 1;
  });

  return { nodes: ctx.nodes, edges: ctx.edges };
}

export function buildCanvasData(project: Entity, mode: CanvasViewMode): CanvasData {
  switch (mode) {
    case 'phase':
      return buildPhaseCanvas(project);
    case 'node':
      return buildNodeCanvas(project);
    default:
      return buildStepCanvas(project);
  }
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (normalized === '.' || normalized === '/') return;
  const exists = await app.vault.adapter.exists(normalized);
  if (exists) return;
  const parent = normalized.split('/').slice(0, -1).join('/');
  if (parent && parent !== normalized) {
    await ensureFolder(app, parent);
  }
  await app.vault.createFolder(normalized).catch(() => undefined);
}

async function writeVaultFile(app: App, path: string, content: string): Promise<TFile> {
  const normalized = normalizePath(path);
  const parent = normalized.split('/').slice(0, -1).join('/');
  if (parent) await ensureFolder(app, parent);
  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
    return existing;
  }
  return app.vault.create(normalized, content);
}

function projectForActiveFile(projects: Entity[], active: TFile | null): Entity | null {
  if (!active) return projects.length === 1 ? projects[0] : null;
  const activePath = active.path;
  for (const project of projects) {
    const folderPath = project.folderPath;
    if (folderPath && (activePath === `${folderPath}/index.md` || activePath.startsWith(`${folderPath}/`))) {
      return project;
    }
  }
  return projects.length === 1 ? projects[0] : null;
}

async function exportProject(app: App, project: Entity, openAfter = false): Promise<CanvasExportResult> {
  if (!project.folderPath) {
    throw new Error(`project ${project.id} is missing folderPath`);
  }
  const outputs: Array<{ mode: CanvasViewMode; path: string }> = [];
  for (const mode of ['step', 'phase', 'node'] as CanvasViewMode[]) {
    const canvas = buildCanvasData(project, mode);
    const outputPath = normalizePath(`${project.folderPath}/canvases/${project.id}-${mode}-view.canvas`);
    await writeVaultFile(app, outputPath, `${JSON.stringify(canvas, null, 2)}\n`);
    outputs.push({ mode, path: outputPath });
  }

  if (openAfter) {
    const first = app.vault.getAbstractFileByPath(outputs[0].path);
    if (first instanceof TFile) {
      await app.workspace.getLeaf(true).openFile(first);
    }
  }

  return { project, files: outputs };
}

export async function exportActiveProjectCanvases(app: App, projects: Entity[]): Promise<void> {
  if (projects.length === 0) {
    new Notice('graph-task: no projects found to export');
    return;
  }
  const activeProject = projectForActiveFile(projects, app.workspace.getActiveFile());
  if (!activeProject) {
    new Notice('graph-task: open a note inside a project first, or use export-all');
    return;
  }
  const result = await exportProject(app, activeProject, true);
  new Notice(`graph-task: exported ${result.files.length} canvas views for ${result.project.id}`);
}

export async function exportAllProjectCanvases(app: App, projects: Entity[]): Promise<void> {
  if (projects.length === 0) {
    new Notice('graph-task: no projects found to export');
    return;
  }
  for (const project of projects) {
    await exportProject(app, project, false);
  }
  new Notice(`graph-task: exported canvas views for ${projects.length} project${projects.length === 1 ? '' : 's'}`);
}

export function describeCanvasPaths(project: Entity): string[] {
  if (!project.folderPath) return [];
  return (['step', 'phase', 'node'] as CanvasViewMode[]).map((mode) => normalizePath(`${project.folderPath}/canvases/${project.id}-${mode}-view.canvas`));
}
