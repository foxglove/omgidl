import { ConstantIDLNode } from "./ConstantIDLNode";
import { IDLNode } from "./IDLNode";
import { AnyIDLNode, IModuleIDLNode } from "./interfaces";
import { ModuleASTNode } from "../astTypes";
import { IDLMessageDefinition, IDLMessageDefinitionField } from "../types";

export class ModuleIDLNode extends IDLNode<ModuleASTNode> implements IModuleIDLNode {
  /** Writes out module to message definition that contains only its directly descendent constant definitions */
  toIDLMessageDefinition(): IDLMessageDefinition | undefined {
    const definitions: IDLMessageDefinitionField[] = this.definitions.flatMap((def) => {
      if (def instanceof ConstantIDLNode) {
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

  get definitions(): AnyIDLNode[] {
    return this.astNode.definitions.map((def) =>
      this.getNode([...this.scopePath, this.name], def.name),
    );
  }
}
