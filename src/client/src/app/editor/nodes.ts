import { ClassicPreset } from 'rete';
import { NodeType } from '../models/graph.models';

const outputSocket = new ClassicPreset.Socket('output');
const inputSocket = new ClassicPreset.Socket('input');

export { outputSocket, inputSocket };

export class ControllerNode extends ClassicPreset.Node {
  width = 220;
  height = 160;
  nodeType = NodeType.Controller;

  constructor(
    public name: string,
    public description: string = '',
  ) {
    super('Controller: ' + name);
    this.addOutput('out', new ClassicPreset.Output(outputSocket, 'Actions'));
  }
}

export class CqrsCommandNode extends ClassicPreset.Node {
  width = 220;
  height = 160;
  nodeType = NodeType.CqrsCommand;

  constructor(
    public name: string,
    public returnType: string = 'bool',
    public generateFileExtension: string = '.g.cs',
  ) {
    super('Command: ' + name);
    this.addInput('in', new ClassicPreset.Input(inputSocket, 'Controller'));
  }
}

export class CqrsQueryNode extends ClassicPreset.Node {
  width = 220;
  height = 160;
  nodeType = NodeType.CqrsQuery;

  constructor(
    public name: string,
    public returnType: string = 'string',
    public generateFileExtension: string = '.g.cs',
  ) {
    super('Query: ' + name);
    this.addInput('in', new ClassicPreset.Input(inputSocket, 'Controller'));
  }
}

export class ActionNode extends ClassicPreset.Node {
  width = 220;
  height = 160;
  nodeType = NodeType.Action;

  constructor(
    public name: string,
    public httpVerb: string = 'Post',
    public generateFileExtension: string = '.g.cs',
  ) {
    super('Action: ' + name);
    this.addInput('in', new ClassicPreset.Input(inputSocket, 'Controller'));
  }
}

export type AppNode = ControllerNode | CqrsCommandNode | CqrsQueryNode | ActionNode;
export type AppConnection = ClassicPreset.Connection<AppNode, AppNode>;
export type AppSchemes = ClassicPreset.Node & { width?: number; height?: number };
