import { IDLNode, toScopedIdentifier } from "./IDLNode";
import { AnyIDLNode, IConstantIDLNode, IEnumIDLNode } from "./interfaces";
import { EnumASTNode } from "../astTypes";
import { IDLMessageDefinition } from "../types";

/** Class used to resolve an Enum ASTNode to an IDLMessageDefinition */

export class EnumIDLNode extends IDLNode<EnumASTNode> implements IEnumIDLNode {
  constructor(scopePath: string[], astNode: EnumASTNode, idlMap: Map<string, AnyIDLNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return "uint32";
  }

  private enumeratorNodes(): IConstantIDLNode[] {
    return this.astNode.enumerators.map((enumerator) =>
      this.getConstantNode(toScopedIdentifier([...this.scopePath, this.name, enumerator])),
    );
  }

  public toIDLMessageDefinition(): IDLMessageDefinition {
    const definitions = this.enumeratorNodes().map((enumerator) =>
      enumerator.toIDLMessageDefinitionField(),
    );
    return {
      name: toScopedIdentifier([...this.scopePath, this.name]),
      definitions,
      // Going to use the module aggregated kind since that's what we store constants in
      aggregatedKind: "module",
    };
  }
}
