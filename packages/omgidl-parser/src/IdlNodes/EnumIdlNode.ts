import { ConstantIdlNode } from "./ConstantIdlNode";
import { IdlNode, toScopedIdentifier } from "./IdlNode";
import { EnumAstNode } from "../astTypes";
import { IdlMessageDefinition } from "../types";

/** Class used to resolve an Enum ASTNode to an IdlMessageDefinition */

export class EnumIdlNode extends IdlNode<EnumAstNode> {
  constructor(scopePath: string[], astNode: EnumAstNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return "uint32";
  }

  private enumeratorNodes(): ConstantIdlNode[] {
    return this.astNode.enumerators.map((enumerator) =>
      this.getConstantNode(toScopedIdentifier([...this.scopePath, this.name, enumerator])),
    );
  }

  public toIdlMessageDefinition(): IdlMessageDefinition {
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
