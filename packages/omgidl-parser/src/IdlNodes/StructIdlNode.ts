import { IdlNode } from "./IdlNode";
import { StructMemberIdlNode } from "./ReferenceTypeIdlNode";
import { StructASTNode } from "../astTypes";
import { IDLMessageDefinition } from "../types";

export class StructIdlNode extends IdlNode<StructASTNode> {
  constructor(scopePath: string[], astNode: StructASTNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return this.astNode.name;
  }

  get definitions(): StructMemberIdlNode[] {
    return this.astNode.definitions.map((def) => this.getStructMemberNode(def.name));
  }

  get isComplex(): boolean {
    return true;
  }

  get isArray(): undefined {
    return undefined;
  }

  get arrayLengths(): undefined {
    return undefined;
  }

  toIDLMessageDefinition(): IDLMessageDefinition {
    const definitions = this.definitions.map((def) => def.toIDLMessageDefinitionField());
    return {
      name: this.scopedIdentifier,
      definitions,
      aggregatedKind: "struct",
      ...(this.astNode.annotations ? { annotations: this.astNode.annotations } : undefined),
    };
  }

  private getStructMemberNode(name: string): StructMemberIdlNode {
    const maybeStructMember = this.getNode([...this.scopePath, this.name], name);
    if (!(maybeStructMember instanceof StructMemberIdlNode)) {
      throw new Error(`Expected ${name} to be a struct member in ${this.scopedIdentifier}`);
    }
    return maybeStructMember;
  }
}
