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
   * КФИГУРАЦИЯ СЕТКИ (Расстояния между нодами)
   * РЕДАКТИРУЙТЕ ТУТ:
   */
  private readonly H_SPACING = 500; // По горизонтали (от колонки к колонке)
  private readonly V_SPACING = 250; // По вертикали (между нодами в колонке)

  async autoArrange(): Promise<void> {
    if (!this.editorInstance) return;
    
    const editor = this.editorInstance.editor;
    const nodes = editor.getNodes();
    const connections = editor.getConnections();

    // 1. Build adjacency list and find roots
    const inputs = new Map<string, string[]>();
    const outputs = new Map<string, string[]>();
    
    nodes.forEach(n => {
      inputs.set(n.id, []);
      outputs.set(n.id, []);
    });

    connections.forEach(c => {
      inputs.get(c.target)?.push(c.source);
      outputs.get(c.source)?.push(c.target);
    });

    // 2. Assign depth (longest path from root)
    const depths = new Map<string, number>();
    nodes.forEach(n => depths.set(n.id, 0)); // default to 0

    // simple topological depth assignment
    let changed = true;
    while(changed) {
      changed = false;
      for (const n of nodes) {
        const inNodes = inputs.get(n.id) || [];
        if (inNodes.length > 0) {
          const maxParentDepth = Math.max(...inNodes.map(p => depths.get(p) || 0));
          if (depths.get(n.id) !== maxParentDepth + 1) {
            depths.set(n.id, maxParentDepth + 1);
            changed = true;
          }
        }
      }
    }

    // 3. Group by depth, then by nodeType
    const columns = new Map<number, AppNode[]>();
    nodes.forEach(n => {
      const d = depths.get(n.id) || 0;
      if (!columns.has(d)) columns.set(d, []);
      columns.get(d)?.push(n as AppNode);
    });

    const targetPositions = new Map<string, {x: number, y: number}>();

    for (const [depth, colNodes] of columns.entries()) {
      // Sort nodes inside column by type (to group same types together)
      colNodes.sort((a, b) => a.nodeType.localeCompare(b.nodeType));
      
      let currentY = 50;
      for (let i = 0; i < colNodes.length; i++) {
        const node = colNodes[i];
        
        // Add a bit of extra space if type changes
        if (i > 0 && colNodes[i].nodeType !== colNodes[i-1].nodeType) {
          currentY += 50; // extra gap between different types
        }

        const x = 50 + depth * this.H_SPACING;
        const y = currentY;
        
        targetPositions.set(node.id, { x, y });
        currentY += this.V_SPACING;
      }
    }
    
    // Animate smoothly
    const viewPositions = new Map<string, {x: number, y: number}>();
    for (const node of nodes) {
      const view = this.editorInstance.area.nodeViews.get(node.id);
      viewPositions.set(node.id, view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 });
    }

    const durationMs = 600;
    const startTime = performance.now();
    
    // 4. Camera target setup
    const rootNodes = nodes.filter(n => (n as any).nodeType === NodeType.Controller);
    const focusNode = rootNodes[0] || nodes[0];
    const focusTarget = focusNode ? targetPositions.get(focusNode.id)! : { x: 0, y: 0 };

    const targetZoom = 0.75;
    const paddingLeft = 100; // Левее контроллер
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
    
    // Position the new node relative to selected parent or at offset
    const selected = this.selectedNode();
    if (selected && this.editorInstance) {
      const view = this.editorInstance.area.nodeViews.get(selected.id);
      if (view) {
        await this.editorInstance.area.translate(node.id, {
          x: view.position.x + 350,
          y: view.position.y
        });
      }
    } else {
      await this.editorInstance.area.translate(node.id, {
        x: 100 + Math.random() * 50,
        y: 100 + Math.random() * 50,
      });
    }

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
