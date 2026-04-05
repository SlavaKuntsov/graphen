import {
  Component,
  ChangeDetectionStrategy,
  signal,
  viewChild,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
  AfterViewInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EditorInstance, createEditor } from './editor/editor';
import { GraphApiService } from './services/graph-api.service';
import {
  ControllerNode,
  CqrsCommandNode,
  CqrsQueryNode,
  ActionNode,
  AppNode,
} from './editor/nodes';
import { NodeType } from './models/graph.models';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnDestroy, AfterViewInit {
  private readonly injector = inject(Injector);
  private readonly api = inject(GraphApiService);

  private editorInstance: EditorInstance | null = null;

  readonly reteContainer = viewChild<ElementRef<HTMLElement>>('reteContainer');

  readonly projectPath = signal(localStorage.getItem('graphen_path') ?? '');
  readonly projectName = signal('');
  readonly isLoading = signal(false);
  readonly toastMessage = signal('');
  readonly toastType = signal<'success' | 'error'>('success');
  readonly showToast = signal(false);

  // Sidebar
  readonly sidebarOpen = signal(false);
  readonly selectedNode = signal<AppNode | null>(null);
  readonly selectedNodeName = signal('');
  readonly selectedNodeDescription = signal('');
  readonly selectedNodeReturnType = signal('');
  readonly selectedNodeHttpVerb = signal('');
  readonly selectedNodeExtension = signal('.g.cs');

  // Add node
  readonly addNodeType = signal<NodeType>(NodeType.Controller);
  readonly addNodeName = signal('');

  readonly nodeTypes = [
    { value: NodeType.Controller, label: 'Controller', icon: '🎛️' },
    { value: NodeType.CqrsCommand, label: 'Command', icon: '⚡' },
    { value: NodeType.CqrsQuery, label: 'Query', icon: '🔍' },
    { value: NodeType.Action, label: 'Action', icon: '🎯' },
  ];

  /** 
   * КОНФИГУРАЦИЯ СЕТКИ (Расстояния между нодами)
   * РЕДАКТИРУЙТЕ ТУТ:
   */
  private readonly H_SPACING = 400; // По горизонтали (от колонки к колонке)
  private readonly V_SPACING = 220; // По вертикали (между нодами в колонке)
  private readonly BAND_GAP = 80;   // Дополнительный отступ между полосами контроллеров

  /**
   * Логический порядок колонок по типу:
   * 0 — Controllers
   * 1 — Actions
   * 2 — CQRS (Commands & Queries)
   */
  private getLogicalColumn(nodeType: NodeType): number {
    switch (nodeType) {
      case NodeType.Controller: return 0;
      case NodeType.Action:     return 1;
      case NodeType.CqrsCommand:
      case NodeType.CqrsQuery:  return 2;
      default: return 0;
    }
  }

  async autoArrange(): Promise<void> {
    if (!this.editorInstance) return;
    
    const editor = this.editorInstance.editor;
    const nodes = editor.getNodes() as AppNode[];
    const connections = editor.getConnections();

    // 1. Build connection map: Controller → connected child nodes
    const childrenOf = new Map<string, Set<string>>();  // controllerId → Set of child node IDs
    
    for (const conn of connections) {
      const source = editor.getNode(conn.source) as AppNode | undefined;
      const target = editor.getNode(conn.target) as AppNode | undefined;
      if (!source || !target) continue;

      // Controller → child (Action or CQRS)
      if (source.nodeType === NodeType.Controller) {
        if (!childrenOf.has(source.id)) childrenOf.set(source.id, new Set());
        childrenOf.get(source.id)!.add(target.id);
      }
      // child → Controller (reverse connection)
      if (target.nodeType === NodeType.Controller) {
        if (!childrenOf.has(target.id)) childrenOf.set(target.id, new Set());
        childrenOf.get(target.id)!.add(source.id);
      }
    }

    // 2. Determine which logical columns are actually populated
    const hasActions = nodes.some(n => n.nodeType === NodeType.Action);
    const hasCqrs = nodes.some(n => 
      n.nodeType === NodeType.CqrsCommand || n.nodeType === NodeType.CqrsQuery
    );

    // Build a map: logical column → physical X index (skipping empty columns)
    const physicalColumn = new Map<number, number>();
    let colIdx = 0;
    physicalColumn.set(0, colIdx++); // Controllers always col 0
    if (hasActions) physicalColumn.set(1, colIdx++);
    if (hasCqrs) physicalColumn.set(2, colIdx++);

    // 3. Group controllers and sort them alphabetically
    const controllers = nodes
      .filter(n => n.nodeType === NodeType.Controller)
      .sort((a, b) => a.label.localeCompare(b.label));

    // Track which CQRS/Action nodes are assigned to a controller
    const assignedNodes = new Set<string>();

    // 4. Build bands: each controller + its children
    interface Band {
      controller: AppNode;
      actions: AppNode[];
      cqrs: AppNode[];
    }

    const bands: Band[] = [];
    for (const ctrl of controllers) {
      const childIds = childrenOf.get(ctrl.id) || new Set();
      const actions: AppNode[] = [];
      const cqrs: AppNode[] = [];

      for (const childId of childIds) {
        const child = editor.getNode(childId) as AppNode | undefined;
        if (!child) continue;
        if (child.nodeType === NodeType.Action) {
          actions.push(child);
        } else if (child.nodeType === NodeType.CqrsCommand || child.nodeType === NodeType.CqrsQuery) {
          cqrs.push(child);
        }
        assignedNodes.add(childId);
      }

      // Sort: Commands before Queries, then alphabetically
      cqrs.sort((a, b) => {
        if (a.nodeType !== b.nodeType) return a.nodeType.localeCompare(b.nodeType);
        return a.label.localeCompare(b.label);
      });
      actions.sort((a, b) => a.label.localeCompare(b.label));

      assignedNodes.add(ctrl.id);
      bands.push({ controller: ctrl, actions, cqrs });
    }

    // 5. Collect orphan nodes (not assigned to any controller)
    const orphanActions = nodes.filter(n => n.nodeType === NodeType.Action && !assignedNodes.has(n.id));
    const orphanCqrs = nodes.filter(n => 
      (n.nodeType === NodeType.CqrsCommand || n.nodeType === NodeType.CqrsQuery) && !assignedNodes.has(n.id)
    ).sort((a, b) => {
      if (a.nodeType !== b.nodeType) return a.nodeType.localeCompare(b.nodeType);
      return a.label.localeCompare(b.label);
    });

    // 6. Calculate positions band by band
    const targetPositions = new Map<string, {x: number, y: number}>();
    let currentY = 50;

    for (const band of bands) {
      const ctrlX = 50 + (physicalColumn.get(0) ?? 0) * this.H_SPACING;
      targetPositions.set(band.controller.id, { x: ctrlX, y: currentY });

      // Place Actions in their column
      const actionCol = physicalColumn.get(1);
      if (actionCol !== undefined) {
        const actionX = 50 + actionCol * this.H_SPACING;
        let actionY = currentY;
        for (const action of band.actions) {
          targetPositions.set(action.id, { x: actionX, y: actionY });
          actionY += this.V_SPACING;
        }
      }

      // Place CQRS in their column
      const cqrsCol = physicalColumn.get(2);
      if (cqrsCol !== undefined) {
        const cqrsX = 50 + cqrsCol * this.H_SPACING;
        let cqrsY = currentY;
        for (const cqrsNode of band.cqrs) {
          targetPositions.set(cqrsNode.id, { x: cqrsX, y: cqrsY });
          cqrsY += this.V_SPACING;
        }
      }

      // Move Y down past the tallest sub-column in this band
      const bandHeight = Math.max(
        1,
        band.actions.length,
        band.cqrs.length
      );
      currentY += bandHeight * this.V_SPACING + this.BAND_GAP;
    }

    // 7. Place orphan nodes at the bottom
    if (orphanActions.length > 0) {
      const actionCol = physicalColumn.get(1);
      if (actionCol !== undefined) {
        const actionX = 50 + actionCol * this.H_SPACING;
        for (const orphan of orphanActions) {
          targetPositions.set(orphan.id, { x: actionX, y: currentY });
          currentY += this.V_SPACING;
        }
      }
    }

    if (orphanCqrs.length > 0) {
      const cqrsCol = physicalColumn.get(2);
      if (cqrsCol !== undefined) {
        const cqrsX = 50 + cqrsCol * this.H_SPACING;
        // Start at the bottom of the last band for orphan CQRS
        let orphanY = currentY;
        for (const orphan of orphanCqrs) {
          targetPositions.set(orphan.id, { x: cqrsX, y: orphanY });
          orphanY += this.V_SPACING;
        }
      }
    }
    
    // 8. Animate smoothly
    const viewPositions = new Map<string, {x: number, y: number}>();
    for (const node of nodes) {
      const view = this.editorInstance.area.nodeViews.get(node.id);
      viewPositions.set(node.id, view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 });
    }

    const durationMs = 600;
    const startTime = performance.now();
    
    // 9. Camera target — focus on first Controller
    const focusNode = controllers[0] || nodes[0];
    const focusTarget = focusNode ? targetPositions.get(focusNode.id)! : { x: 0, y: 0 };

    const targetZoom = 0.75;
    const paddingLeft = 100;
    const paddingTop = 60;
    
    const targetAreaX = paddingLeft - focusTarget.x * targetZoom;
    const targetAreaY = paddingTop - focusTarget.y * targetZoom;
    const startTransform = { ...this.editorInstance.area.area.transform };

    await new Promise<void>(resolve => {
      const animate = (time: number) => {
        const progress = Math.min((time - startTime) / durationMs, 1);
        const ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart

        for (const [id, target] of targetPositions.entries()) {
          const start = viewPositions.get(id)!;
          this.editorInstance!.area.translate(id, {
            x: start.x + (target.x - start.x) * ease,
            y: start.y + (target.y - start.y) * ease
          });
        }
        
        // Synced camera movement
        const currentZoom = startTransform.k + (targetZoom - startTransform.k) * ease;
        const currentX = startTransform.x + (targetAreaX - startTransform.x) * ease;
        const currentY = startTransform.y + (targetAreaY - startTransform.y) * ease;
        
        this.editorInstance!.area.area.zoom(currentZoom, 0, 0);
        this.editorInstance!.area.area.translate(currentX, currentY);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(animate);
    });

    this.toast('Граф упорядочен и фокус наведен', 'success');
  }

  ngAfterViewInit(): void {
    // Automatically load project on startup (backend resolves default path if empty)
    setTimeout(() => {
      this.onLoad().catch(() => {
        // If the default load totally fails, we could init empty
        this.onInitEmpty();
      });
    }, 100);
  }

  ngOnDestroy(): void {
    this.editorInstance?.destroy();
  }

  async onLoad(): Promise<void> {
    const path = this.projectPath();
    localStorage.setItem('graphen_path', path);

    this.isLoading.set(true);

    try {
      await this.initEditor();

      this.api.loadProject(path || undefined).subscribe({
        next: async (project) => {
          this.projectName.set(project.projectName || project.graph.projectName);
          await this.editorInstance!.importGraph(project.graph);
          this.isLoading.set(false);
          this.toast('Граф загружен!', 'success');
        },
        error: (err) => {
          this.isLoading.set(false);
          // If the default project wasn't found (e.g. clean start), fallback to empty
          if (err.status === 404) {
            this.onInitEmpty();
          } else {
            const msg = err.error?.message ?? err.message ?? 'Ошибка загрузки';
            this.toast(msg, 'error');
          }
        },
      });
    } catch {
      this.isLoading.set(false);
      this.toast('Ошибка инициализации редактора', 'error');
    }
  }

  async onInitEmpty(): Promise<void> {
    await this.initEditor();
    this.projectName.set('MyProject');
    this.toast('Пустой граф создан. Добавьте ноды!', 'success');
  }

  onGenerate(): void {
    if (!this.editorInstance) return;

    const graph = this.editorInstance.exportGraph(
      this.projectName() || 'MyProject',
      this.projectPath() || undefined,
    );

    this.isLoading.set(true);

    this.api.generate(graph).subscribe({
      next: (result) => {
        this.isLoading.set(false);
        this.toast(
          `✅ ${result.message} (${result.filesCreated} файлов)`,
          'success',
        );
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err.error?.message ?? err.message ?? 'Ошибка генерации';
        this.toast(msg, 'error');
      },
    });
  }

  async onAddNode(): Promise<void> {
    if (!this.editorInstance) return;

    const name = this.addNodeName() || 'New';
    const type = this.addNodeType();
    let node: AppNode;

    switch (type) {
      case NodeType.Controller:
        node = new ControllerNode(name);
        break;
      case NodeType.CqrsCommand:
        node = new CqrsCommandNode(name);
        break;
      case NodeType.CqrsQuery:
        node = new CqrsQueryNode(name);
        break;
      case NodeType.Action:
        node = new ActionNode(name);
        break;
    }

    await this.editorInstance.editor.addNode(node);
    
    // Position in the correct column based on node type
    const col = this.getLogicalColumn(type);
    const existingNodes = (this.editorInstance.editor.getNodes() as AppNode[])
      .filter(n => n.id !== node.id && this.getLogicalColumn(n.nodeType) === col);
    
    // Find the bottom-most node in this column to place the new one below it
    let maxY = 50 - this.V_SPACING; // Start position minus spacing (so first node = 50)
    for (const existing of existingNodes) {
      const view = this.editorInstance.area.nodeViews.get(existing.id);
      if (view && view.position.y > maxY) {
        maxY = view.position.y;
      }
    }

    const x = 50 + col * this.H_SPACING;
    const y = maxY + this.V_SPACING;

    await this.editorInstance.area.translate(node.id, { x, y });

    this.addNodeName.set('');
    this.toast(`Нода "${name}" добавлена`, 'success');
  }

  async onDeleteNode(): Promise<void> {
    const node = this.selectedNode();
    if (!node || !this.editorInstance) return;

    // Remove connected edges first
    const connections = this.editorInstance.editor
      .getConnections()
      .filter((c) => c.source === node.id || c.target === node.id);
    for (const conn of connections) {
      await this.editorInstance.editor.removeConnection(conn.id);
    }

    await this.editorInstance.editor.removeNode(node.id);
    this.selectedNode.set(null);
    this.sidebarOpen.set(false);
    this.toast('Нода удалена', 'success');
  }

  onApplyNodeChanges(): void {
    const node = this.selectedNode();
    if (!node) return;

    if (node instanceof ControllerNode) {
      node.name = this.selectedNodeName();
      node.description = this.selectedNodeDescription();
      node.label = 'Controller: ' + node.name;
    } else if (node instanceof CqrsCommandNode) {
      node.name = this.selectedNodeName();
      node.returnType = this.selectedNodeReturnType();
      node.generateFileExtension = this.selectedNodeExtension();
      node.label = 'Command: ' + node.name;
    } else if (node instanceof CqrsQueryNode) {
      node.name = this.selectedNodeName();
      node.returnType = this.selectedNodeReturnType();
      node.generateFileExtension = this.selectedNodeExtension();
      node.label = 'Query: ' + node.name;
    } else if (node instanceof ActionNode) {
      node.name = this.selectedNodeName();
      node.httpVerb = this.selectedNodeHttpVerb();
      node.generateFileExtension = this.selectedNodeExtension();
      node.label = 'Action: ' + node.name;
    }

    // Force area update
    this.editorInstance?.area.update('node', node.id);
    this.toast('Свойства обновлены', 'success');
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
    this.selectedNode.set(null);
  }

  private async initEditor(): Promise<void> {
    if (this.editorInstance) {
      this.editorInstance.destroy();
      this.editorInstance = null;
    }

    const el = this.reteContainer()?.nativeElement;
    if (!el) return;

    // Clear container
    el.innerHTML = '';

    this.editorInstance = await createEditor(el, this.injector);

    // Track pointer movement for click vs drag detection
    let startX = 0;
    let startY = 0;

    this.editorInstance.area.addPipe((ctx) => {
      if (ctx.type === 'pointerdown') {
        const event = ctx.data.event as PointerEvent;
        startX = event.clientX;
        startY = event.clientY;
      } else if (ctx.type === 'pointerup') {
        const event = ctx.data.event as PointerEvent;
        const dx = Math.abs(event.clientX - startX);
        const dy = Math.abs(event.clientY - startY);
        const isClick = dx < 10 && dy < 10; // Threshold for a "click"

        if (isClick && this.editorInstance) {
          // If a click occurred on the background (not a node), close sidebar
          const isNodeClick = (event.target as HTMLElement).closest('.node');
          if (!isNodeClick) {
            this.closeSidebar();
            // No need to update area if we're just closing sidebar, 
            // but we could if we had visual selection in the canvas
          }
        }
      } else if (ctx.type === 'nodepicked') {
        const nodeId = ctx.data.id;
        const node = this.editorInstance!.editor.getNode(nodeId);
        if (node) {
          this.selectNode(node as AppNode);
        }
      }
      return ctx;
    });
  }

  private selectNode(node: AppNode): void {
    this.selectedNode.set(node);
    this.sidebarOpen.set(true);

    if (node instanceof ControllerNode) {
      this.selectedNodeName.set(node.name);
      this.selectedNodeDescription.set(node.description);
    } else if (node instanceof CqrsCommandNode) {
      this.selectedNodeName.set(node.name);
      this.selectedNodeReturnType.set(node.returnType);
      this.selectedNodeExtension.set(node.generateFileExtension);
    } else if (node instanceof CqrsQueryNode) {
      this.selectedNodeName.set(node.name);
      this.selectedNodeReturnType.set(node.returnType);
      this.selectedNodeExtension.set(node.generateFileExtension);
    } else if (node instanceof ActionNode) {
      this.selectedNodeName.set(node.name);
      this.selectedNodeHttpVerb.set(node.httpVerb);
      this.selectedNodeExtension.set(node.generateFileExtension);
    }
  }

  private toast(message: string, type: 'success' | 'error'): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 3500);
  }
}
