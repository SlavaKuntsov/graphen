import { Injector } from '@angular/core';
import { NodeEditor, GetSchemes, ClassicPreset } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { AngularPlugin, Presets, AngularArea2D } from 'rete-angular-plugin/21';

import {
  ControllerNode,
  CqrsCommandNode,
  CqrsQueryNode,
  ActionNode,
  AppNode,
} from './nodes';
import { GraphNode, GraphEdge, NodeType, ProjectGraph } from '../models/graph.models';

type Schemes = GetSchemes<
  ClassicPreset.Node,
  ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>
>;

type AreaExtra = AngularArea2D<Schemes>;

export interface EditorInstance {
  editor: NodeEditor<Schemes>;
  area: AreaPlugin<Schemes, AreaExtra>;
  destroy: () => void;
  exportGraph: (projectName: string, targetPath?: string) => ProjectGraph;
  importGraph: (graph: ProjectGraph) => Promise<void>;
}

export async function createEditor(
  container: HTMLElement,
  injector: Injector,
): Promise<EditorInstance> {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<Schemes, AreaExtra>();
  const render = new AngularPlugin<Schemes, AreaExtra>({ injector });

  AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
    accumulating: AreaExtensions.accumulateOnCtrl(),
  });

  render.addPreset(Presets.classic.setup());
  connection.addPreset(ConnectionPresets.classic.setup());

  editor.use(area);
  area.use(connection);
  area.use(render);

  AreaExtensions.simpleNodesOrder(area);

  function createNodeFromGraphNode(gn: GraphNode): AppNode {
    switch (gn.type) {
      case NodeType.Controller:
        return new ControllerNode(
          gn.properties.name ?? gn.properties.className ?? 'Controller',
          gn.properties.description ?? '',
        );
      case NodeType.CqrsCommand:
        return new CqrsCommandNode(
          gn.properties.name ?? 'Command',
          gn.properties.returnType ?? 'bool',
          gn.properties.generateFileExtension ?? '.g.cs',
        );
      case NodeType.CqrsQuery:
        return new CqrsQueryNode(
          gn.properties.name ?? 'Query',
          gn.properties.returnType ?? 'string',
          gn.properties.generateFileExtension ?? '.g.cs',
        );
      case NodeType.Action:
        return new ActionNode(
          gn.properties.name ?? 'Action',
          gn.properties.httpVerb ?? 'Post',
          gn.properties.generateFileExtension ?? '.g.cs',
        );
    }
  }

  async function importGraph(graph: ProjectGraph): Promise<void> {
    // Clear existing
    for (const conn of editor.getConnections()) {
      await editor.removeConnection(conn.id);
    }
    for (const node of editor.getNodes()) {
      await editor.removeNode(node.id);
    }

    // Map original IDs to rete IDs
    const idMap = new Map<string, string>();

    for (const gn of graph.nodes) {
      const node = createNodeFromGraphNode(gn);
      await editor.addNode(node);
      await area.translate(node.id, { x: gn.position.x, y: gn.position.y });
      idMap.set(gn.id, node.id);
    }

    for (const edge of graph.edges) {
      const sourceId = idMap.get(edge.sourceNodeId);
      const targetId = idMap.get(edge.targetNodeId);
      if (!sourceId || !targetId) continue;

      const sourceNode = editor.getNode(sourceId);
      const targetNode = editor.getNode(targetId);
      if (!sourceNode || !targetNode) continue;

      const conn = new ClassicPreset.Connection(sourceNode, 'out', targetNode, 'in');
      await editor.addConnection(conn);
    }

    await AreaExtensions.zoomAt(area, editor.getNodes());
  }

  function exportGraph(projectName: string, targetPath?: string): ProjectGraph {
    const nodes: GraphNode[] = editor.getNodes().map(node => {
      const view = area.nodeViews.get(node.id);
      const position = view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 };

      let type = NodeType.Controller;
      const props: Record<string, string | undefined> = {};

      if (node instanceof ControllerNode) {
        type = NodeType.Controller;
        props['name'] = node.name;
        props['description'] = node.description;
      } else if (node instanceof CqrsCommandNode) {
        type = NodeType.CqrsCommand;
        props['name'] = node.name;
        props['returnType'] = node.returnType;
        props['generateFileExtension'] = node.generateFileExtension;
      } else if (node instanceof CqrsQueryNode) {
        type = NodeType.CqrsQuery;
        props['name'] = node.name;
        props['returnType'] = node.returnType;
        props['generateFileExtension'] = node.generateFileExtension;
      } else if (node instanceof ActionNode) {
        type = NodeType.Action;
        props['name'] = node.name;
        props['httpVerb'] = node.httpVerb;
        props['generateFileExtension'] = node.generateFileExtension;
      }

      return {
        id: node.id,
        type,
        position,
        properties: props,
      };
    });

    const edges: GraphEdge[] = editor.getConnections().map(conn => ({
      id: conn.id,
      sourceNodeId: conn.source,
      sourceHandle: 'out',
      targetNodeId: conn.target,
      targetHandle: 'in',
    }));

    return { projectName, targetPath, nodes, edges };
  }

  return {
    editor,
    area,
    destroy: () => area.destroy(),
    exportGraph,
    importGraph,
  };
}
