import { IDLDefinitionMap, toScopedIdentifier } from "./IDLDefinitionMap";
import { IDLConstantNode, IDLNode } from "./IDLNode";
import { IDLMessageDefinition, IDLMessageDefinitionField, ModuleASTNode } from "./types";

export class IDLModuleNode extends IDLNode<ModuleASTNode> {
  constructor(scopePath: string[], astNode: ModuleASTNode, idlMap: IDLDefinitionMap) {
    super(scopePath, astNode, idlMap);
  }

  toIDLMessageDefinition(): IDLMessageDefinition | undefined {
    const definitions: IDLMessageDefinitionField[] = this.definitions.flatMap((def) => {
      if (def instanceof IDLConstantNode) {
        return [def.toIDLMessageDefinitionField()];
      }
      return [];
    });
    if (definitions.length === 0) {
      return undefined;
    }
    return {
      name: toScopedIdentifier([...this.scopePath, this.name]),
      definitions,
      aggregatedKind: "module",
    };
  }

  get definitions(): IDLNode[] {
    return this.astNode.definitions.map((def) =>
      this.getNode([...this.scopePath, this.name], def.name),
    );
  }
}
