import {
  Component,
  ChangeDetectionStrategy,
  signal,
  viewChild,
  ElementRef,
  inject,
  Injector,
  OnDestroy,
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
export class App implements OnDestroy {
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
          const msg = err.error?.message ?? err.message ?? 'Ошибка загрузки';
          this.toast(msg, 'error');
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
    await this.editorInstance.area.translate(node.id, {
      x: 100 + Math.random() * 300,
      y: 100 + Math.random() * 200,
    });

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

    // Listen for node selection (clicks)
    this.editorInstance.area.addPipe((ctx) => {
      if (ctx.type === 'nodepicked') {
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
