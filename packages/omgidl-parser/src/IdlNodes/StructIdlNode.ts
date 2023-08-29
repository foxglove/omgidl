import { IdlNode } from "./IdlNode";
import { StructMemberIdlNode } from "./StructMemberIdlNode";
import { AnyIdlNode, IStructIdlNode } from "./interfaces";
import { StructAstNode } from "../astTypes";
import { IdlMessageDefinition } from "../types";

export class StructIdlNode extends IdlNode<StructAstNode> implements IStructIdlNode {
  constructor(scopePath: string[], astNode: StructAstNode, idlMap: Map<string, AnyIdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return this.astNode.name;
  }

  get definitions(): StructMemberIdlNode[] {
    return this.astNode.definitions.map((def) => this.getStructMemberNode(def.name));
  }

  /** Writes out struct as IDL Message definition with resolved `definitions` members */
  toIdlMessageDefinition(): IdlMessageDefinition {
    const definitions = this.definitions.map((def) => def.toIdlMessageDefinitionField());
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
    if (maybeStructMember.declarator !== "struct-member") {
      throw new Error(`Expected ${name} to be a struct member in ${this.scopedIdentifier}`);
    }
    return maybeStructMember as StructMemberIdlNode;
  }
}
