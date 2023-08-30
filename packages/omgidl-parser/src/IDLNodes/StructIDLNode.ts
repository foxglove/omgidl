import { IDLNode } from "./IDLNode";
import { StructMemberIDLNode } from "./StructMemberIDLNode";
import { AnyIDLNode, IStructIDLNode } from "./interfaces";
import { StructASTNode } from "../astTypes";
import { IDLMessageDefinition } from "../types";

export class StructIDLNode extends IDLNode<StructASTNode> implements IStructIDLNode {
  constructor(scopePath: string[], astNode: StructASTNode, idlMap: Map<string, AnyIDLNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return this.astNode.name;
  }

  get definitions(): StructMemberIDLNode[] {
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
  private getStructMemberNode(name: string): StructMemberIDLNode {
    const maybeStructMember = this.getNode([...this.scopePath, this.name], name);
    if (maybeStructMember.declarator !== "struct-member") {
      throw new Error(`Expected ${name} to be a struct member in ${this.scopedIdentifier}`);
    }
    return maybeStructMember as StructMemberIDLNode;
  }
}
