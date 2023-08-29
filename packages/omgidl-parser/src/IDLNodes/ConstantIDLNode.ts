import { ConstantValue } from "@foxglove/message-definition";

import { EnumIDLNode } from "./EnumIDLNode";
import { IDLNode } from "./IDLNode";
import { AnyIDLNode, IConstantIDLNode } from "./interfaces";
import { ConstantASTNode } from "../astTypes";
import { SIMPLE_TYPES, normalizeType } from "../primitiveTypes";
import { IDLMessageDefinitionField } from "../types";

/** Wraps constant node so that its type and value can be resolved and written to a message definition */

export class ConstantIDLNode extends IDLNode<ConstantASTNode> implements IConstantIDLNode {
  /** If the type needs resolution (not simple primitive) this will be set to true. Should only ever mean that it's referencing an enum */
  private typeNeedsResolution = false;
  constructor(scopePath: string[], astNode: ConstantASTNode, idlMap: Map<string, AnyIDLNode>) {
    super(scopePath, astNode, idlMap);
    if (!SIMPLE_TYPES.has(astNode.type)) {
      this.typeNeedsResolution = true;
    }
  }

  get type(): string {
    if (this.typeNeedsResolution) {
      return this.getReferencedEnumNode().type;
    }
    return this.astNode.type;
  }

  /** Holds reference so that it doesn't need to be searched for again */
  private referencedEnumNode?: EnumIDLNode = undefined;
  /** Gets enum node referenced by type. Fails otherwise. */
  private getReferencedEnumNode(): EnumIDLNode {
    if (this.referencedEnumNode == undefined) {
      const maybeEnumNode = this.getNode(this.scopePath, this.astNode.type);
      if (!(maybeEnumNode instanceof EnumIDLNode)) {
        throw new Error(`Expected ${this.astNode.type} to be an enum in ${this.scopedIdentifier}`);
      }
      this.referencedEnumNode = maybeEnumNode;
    }
    return this.referencedEnumNode;
  }

  get isConstant(): true {
    return true;
  }

  /** Return Literal value on astNode or if the constant references another constant, then it gets the value that constant uses */
  get value(): ConstantValue {
    if (typeof this.astNode.value === "object") {
      return this.getConstantNode(this.astNode.value.name).value;
    }
    return this.astNode.value;
  }

  /** Writes resolved IDLMessageDefinition */
  toIDLMessageDefinitionField(): IDLMessageDefinitionField {
    return {
      name: this.name,
      type: normalizeType(this.type),
      value: this.value,
      isConstant: true,
      isComplex: false,
      ...(this.astNode.valueText != undefined ? { valueText: this.astNode.valueText } : undefined),
    };
  }
}
