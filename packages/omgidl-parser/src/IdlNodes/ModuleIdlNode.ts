import { ConstantIdlNode, IdlNode } from "./IdlNode";
import { ModuleASTNode } from "../astTypes";
import { IDLMessageDefinition, IDLMessageDefinitionField } from "../types";

export class ModuleIdlNode extends IdlNode<ModuleASTNode> {
  constructor(scopePath: string[], astNode: ModuleASTNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  toIDLMessageDefinition(): IDLMessageDefinition | undefined {
    const definitions: IDLMessageDefinitionField[] = this.definitions.flatMap((def) => {
      if (def instanceof ConstantIdlNode) {
        return [def.toIDLMessageDefinitionField()];
      }
      return [];
    });
    if (definitions.length === 0) {
      return undefined;
    }
    return {
      name: this.scopedIdentifier,
      definitions,
      aggregatedKind: "module",
    };
  }

  get definitions(): IdlNode[] {
    return this.astNode.definitions.map((def) =>
      this.getNode([...this.scopePath, this.name], def.name),
    );
  }
}
