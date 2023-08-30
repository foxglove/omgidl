import { IDLNode } from "./IDLNode";
import { StructMemberIDLNode } from "./StructMemberIDLNode";
import { AnyIDLNode, IUnionIDLNode } from "./interfaces";
import { UnionASTNode } from "../astTypes";
import { INTEGER_TYPES, SIMPLE_TYPES } from "../primitiveTypes";
import { Case, IDLMessageDefinition, IDLMessageDefinitionField } from "../types";

export class UnionIDLNode extends IDLNode<UnionASTNode> implements IUnionIDLNode {
  constructor(scopePath: string[], astNode: UnionASTNode, idlMap: Map<string, AnyIDLNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return this.astNode.name;
  }

  get isComplex(): boolean {
    return true;
  }

  get switchType(): string {
    let switchType = this.astNode.switchType;
    if (!SIMPLE_TYPES.has(this.astNode.switchType)) {
      const typeNode = this.getNode(this.scopePath, this.astNode.switchType);
      if (typeNode.declarator === "enum" || typeNode.declarator === "typedef") {
        switchType = typeNode.type;
      }
    }
    if (!isValidSwitchType(switchType)) {
      throw new Error(`Invalid resolved switch type ${switchType} in ${this.scopedIdentifier}`);
    }
    return switchType;
  }

  get cases(): Case[] {
    return this.astNode.cases.map((def) => {
      // These are not referenced anywhere so not necessary having in the map
      const typeNode = new StructMemberIDLNode(
        [...this.scopePath, this.name],
        { ...def.type, declarator: "struct-member" }, // unfortunate shoehorning for struct-member node
        this.map,
      );

      const resolvedPredicates = def.predicates.map((predicate) => {
        if (typeof predicate === "object") {
          return this.getConstantNode(predicate.name).value as number | boolean;
        }
        return predicate;
      });

      const resolvedType = typeNode.toIDLMessageDefinitionField();

      return {
        type: resolvedType,
        predicates: resolvedPredicates,
      };
    });
  }

  get defaultCase(): IDLMessageDefinitionField | undefined {
    if (!this.astNode.defaultCase) {
      return undefined;
    }
    const typeNode = new StructMemberIDLNode(
      [...this.scopePath, this.name],
      { ...this.astNode.defaultCase, declarator: "struct-member" }, // unfortunate shoehorning for struct-member node
      this.map,
    );
    return typeNode.toIDLMessageDefinitionField();
  }

  toIDLMessageDefinition(): IDLMessageDefinition {
    return {
      name: this.scopedIdentifier,
      switchType: this.switchType,
      cases: this.cases,
      aggregatedKind: "union",
      ...(this.astNode.defaultCase ? { defaultCase: this.defaultCase } : undefined),
      ...(this.astNode.annotations ? { annotations: this.astNode.annotations } : undefined),
    };
  }
}

function isValidSwitchType(type: string): boolean {
  return INTEGER_TYPES.has(type) || type === "bool";
}
