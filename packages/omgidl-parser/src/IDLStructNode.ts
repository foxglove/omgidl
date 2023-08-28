import { IDLDefinitionMap, toScopedIdentifier } from "./IDLDefinitionMap";
import { IDLNode } from "./IDLNode";
import { IDLStructMemberNode } from "./ReferenceTypeNode";
import { IDLMessageDefinition, StructASTNode } from "./types";

export class IDLStructNode extends IDLNode<StructASTNode> {
  constructor(scopePath: string[], astNode: StructASTNode, idlMap: IDLDefinitionMap) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return this.astNode.name;
  }

  get definitions(): IDLStructMemberNode[] {
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
      name: toScopedIdentifier([...this.scopePath, this.name]),
      definitions,
      aggregatedKind: "struct",
      ...(this.astNode.annotations ? { annotations: this.astNode.annotations } : undefined),
    };
  }

  private getStructMemberNode(name: string): IDLStructMemberNode {
    const maybeStructMember = this.getNode([...this.scopePath, this.name], name);
    if (!(maybeStructMember instanceof IDLStructMemberNode)) {
      throw new Error(`Expected ${name} to be a struct member in ${this.scopedIdentifier}`);
    }
    return maybeStructMember;
  }
}
