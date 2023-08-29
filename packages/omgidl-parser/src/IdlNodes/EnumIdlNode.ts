import { IdlNode, toScopedIdentifier } from "./IdlNode";
import { AnyIdlNode, IConstantIdlNode, IEnumIdlNode } from "./interfaces";
import { EnumAstNode } from "../astTypes";
import { IdlMessageDefinition } from "../types";

/** Class used to resolve an Enum ASTNode to an IdlMessageDefinition */

export class EnumIdlNode extends IdlNode<EnumAstNode> implements IEnumIdlNode {
  constructor(scopePath: string[], astNode: EnumAstNode, idlMap: Map<string, AnyIdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return "uint32";
  }

  private enumeratorNodes(): IConstantIdlNode[] {
    return this.astNode.enumerators.map((enumerator) =>
      this.getConstantNode(toScopedIdentifier([...this.scopePath, this.name, enumerator])),
    );
  }

  public toIdlMessageDefinition(): IdlMessageDefinition {
    const definitions = this.enumeratorNodes().map((enumerator) =>
      enumerator.toIdlMessageDefinitionField(),
    );
    return {
      name: toScopedIdentifier([...this.scopePath, this.name]),
      definitions,
      // Going to use the module aggregated kind since that's what we store constants in
      aggregatedKind: "module",
    };
  }
}
