import { IDLNode, toScopedIdentifier } from "./IDLNode";
import { IConstantIDLNode, IEnumIDLNode } from "./interfaces";
import { EnumASTNode } from "../astTypes";
import { IDLMessageDefinition } from "../types";

/** Class used to resolve an Enum ASTNode to an IDLMessageDefinition */

export class EnumIDLNode extends IDLNode<EnumASTNode> implements IEnumIDLNode {
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get type(): string {
    return "uint32";
  }

  private enumeratorNodes(): IConstantIDLNode[] {
    return this.astNode.enumerators.map((enumerator) =>
      this.getConstantNode(toScopedIdentifier([...this.scopePath, this.name, enumerator.name])),
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
