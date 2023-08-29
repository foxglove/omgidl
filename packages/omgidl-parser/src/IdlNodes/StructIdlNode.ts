import { IdlNode } from "./IdlNode";
import { StructMemberIdlNode } from "./ReferenceTypeIdlNode";
import { StructAstNode } from "../astTypes";
import { IDLMessageDefinition } from "../types";

export class StructIdlNode extends IdlNode<StructAstNode> {
  constructor(scopePath: string[], astNode: StructAstNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return this.astNode.name;
  }

  get definitions(): StructMemberIdlNode[] {
    return this.astNode.definitions.map((def) => this.getStructMemberNode(def.name));
  }

  /** Writes out struct as IDL Message definition with resolved `definitions` members */
  toIDLMessageDefinition(): IDLMessageDefinition {
    const definitions = this.definitions.map((def) => def.toIDLMessageDefinitionField());
    return {
      name: this.scopedIdentifier,
      definitions,
      aggregatedKind: "struct",
      ...(this.astNode.annotations ? { annotations: this.astNode.annotations } : undefined),
    };
  }

  /** Gets node within struct by its local name (unscoped) */
  private getStructMemberNode(name: string): StructMemberIdlNode {
    const maybeStructMember = this.getNode([...this.scopePath, this.name], name);
    if (!(maybeStructMember instanceof StructMemberIdlNode)) {
      throw new Error(`Expected ${name} to be a struct member in ${this.scopedIdentifier}`);
    }
    return maybeStructMember;
  }
}
