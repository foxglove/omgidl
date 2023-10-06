import { IDLNode } from "./IDLNode";
import { StructMemberIDLNode } from "./StructMemberIDLNode";
import { AnyIDLNode, IEnumIDLNode, ITypedefIDLNode, IUnionIDLNode } from "./interfaces";
import { UnionASTNode } from "../astTypes";
import { INTEGER_TYPES, SIMPLE_TYPES, normalizeType } from "../primitiveTypes";
import { Case, IDLMessageDefinition, IDLMessageDefinitionField } from "../types";

export class UnionIDLNode extends IDLNode<UnionASTNode> implements IUnionIDLNode {
  private switchTypeNeedsResolution = false;
  constructor(scopePath: string[], astNode: UnionASTNode, idlMap: Map<string, AnyIDLNode>) {
    super(scopePath, astNode, idlMap);
    if (!SIMPLE_TYPES.has(this.astNode.switchType)) {
      this.switchTypeNeedsResolution = true;
    }
  }

  get type(): string {
    return this.astNode.name;
  }

  get isComplex(): boolean {
    return true;
  }

  private _switchTypeNode?: IEnumIDLNode | ITypedefIDLNode;
  switchTypeNode(): IEnumIDLNode | ITypedefIDLNode {
    if (this._switchTypeNode) {
      return this._switchTypeNode;
    }
    const typeNode = this.getNode(this.scopePath, this.astNode.switchType);
    if (typeNode.declarator !== "enum" && typeNode.declarator !== "typedef") {
      throw new Error(
        `Invalid switch type "${typeNode.scopedIdentifier}" ${this.astNode.switchType} in ${this.scopedIdentifier}`,
      );
    }
    this._switchTypeNode = typeNode;
    return typeNode;
  }

  get switchType(): string {
    let switchType = this.astNode.switchType;
    if (this.switchTypeNeedsResolution) {
      switchType = this.switchTypeNode().type;
    }
    if (!isValidSwitchType(switchType)) {
      throw new Error(`Invalid resolved switch type ${switchType} in ${this.scopedIdentifier}`);
    }
    return switchType;
  }

  get cases(): Case[] {
    // If the switch type is an enum that means the case predicate values can be just the enumerator name
    // So we need to search the scope of the enum for the enumerator and get its value
    const isEnumSwitchType =
      this.switchTypeNeedsResolution && this.switchTypeNode().declarator === "enum";
    const predicateScopePath = isEnumSwitchType
      ? this.switchTypeNode().scopedIdentifier.split("::")
      : this.scopePath;

    return this.astNode.cases.map((def) => {
      // These are not referenced anywhere so not necessary having in the map
      const typeNode = new StructMemberIDLNode(
        [...this.scopePath, this.name],
        { ...def.type, declarator: "struct-member" }, // unfortunate shoehorning for struct-member node
        this.map,
      );

      const resolvedPredicates = def.predicates.map((predicate) => {
        if (typeof predicate === "object") {
          return this.getConstantNode(predicate.name, predicateScopePath).value as number | boolean;
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
    const annotations = this.annotations;
    return {
      name: this.scopedIdentifier,
      switchType: normalizeType(this.switchType),
      cases: this.cases,
      aggregatedKind: "union",
      ...(this.astNode.defaultCase ? { defaultCase: this.defaultCase } : undefined),
      ...(annotations ? { annotations } : undefined),
    };
  }
}

function isValidSwitchType(type: string): boolean {
  return INTEGER_TYPES.has(type) || type === "bool";
}
