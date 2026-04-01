export enum NodeType {
  Controller = 'Controller',
  CqrsCommand = 'CqrsCommand',
  CqrsQuery = 'CqrsQuery',
  Action = 'Action',
}

export interface Position {
  x: number;
  y: number;
}

export interface NodeProperties {
  className?: string;
  description?: string;
  name?: string;
  returnType?: string;
  httpVerb?: string;
  methodName?: string;
  generateFileExtension?: string;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  position: Position;
  properties: NodeProperties;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  sourceHandle: string;
  targetNodeId: string;
  targetHandle: string;
}

export interface ProjectGraph {
  projectName: string;
  targetPath?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphenProject {
  version: string;
  projectName: string;
  lastGenerated: string;
  graph: ProjectGraph;
}

export interface GenerateResult {
  message: string;
  nodesProcessed: number;
  filesCreated: number;
  outputPath: string;
  graphenJson: string;
  filesData: { fileName: string; relativePath: string }[];
}
