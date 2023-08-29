import { ConstantValue } from "@foxglove/message-definition";

import { EnumIdlNode } from "./EnumIdlNode";
import { IdlNode } from "./IdlNode";
import { ConstantAstNode } from "../astTypes";
import { SIMPLE_TYPES, normalizeType } from "../primitiveTypes";
import { IdlMessageDefinitionField } from "../types";

/** Wraps constant node so that its type and value can be resolved and written to a message definition */

export class ConstantIdlNode extends IdlNode<ConstantAstNode> {
  /** If the type needs resolution (not simple primitive) this will be set to true. Should only ever mean that it's referencing an enum */
  private typeNeedsResolution = false;
  constructor(scopePath: string[], astNode: ConstantAstNode, idlMap: Map<string, IdlNode>) {
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
  private referencedEnumNode?: EnumIdlNode = undefined;
  /** Gets enum node referenced by type. Fails otherwise. */
  private getReferencedEnumNode(): EnumIdlNode {
    if (this.referencedEnumNode == undefined) {
      const maybeEnumNode = this.getNode(this.scopePath, this.astNode.type);
      if (!(maybeEnumNode instanceof EnumIdlNode)) {
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

  /** Writes resolved IdlMessageDefinition */
  toIDLMessageDefinitionField(): IdlMessageDefinitionField {
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
