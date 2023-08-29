import { ConstantIdlNode } from "./ConstantIdlNode";
import { IdlNode } from "./IdlNode";
import { AnyIdlNode, IModuleIdlNode } from "./interfaces";
import { ModuleAstNode } from "../astTypes";
import { IdlMessageDefinition, IdlMessageDefinitionField } from "../types";

export class ModuleIdlNode extends IdlNode<ModuleAstNode> implements IModuleIdlNode {
  constructor(scopePath: string[], astNode: ModuleAstNode, idlMap: Map<string, AnyIdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  /** Writes out module to message definition that contains only its directly descendent constant definitions */
  toIDLMessageDefinition(): IdlMessageDefinition | undefined {
    const definitions: IdlMessageDefinitionField[] = this.definitions.flatMap((def) => {
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

  get definitions(): AnyIdlNode[] {
    return this.astNode.definitions.map((def) =>
      this.getNode([...this.scopePath, this.name], def.name),
    );
  }
}
