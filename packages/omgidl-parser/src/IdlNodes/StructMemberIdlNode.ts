import { ReferenceTypeIdlNode } from "./ReferenceTypeIdlNode";
import { AnyIdlNode, IStructMemberIdlNode } from "./interfaces";
import { StructMemberAstNode } from "../astTypes";
import { normalizeType } from "../primitiveTypes";
import { IdlMessageDefinitionField } from "../types";

export class StructMemberIdlNode
  extends ReferenceTypeIdlNode<StructMemberAstNode>
  implements IStructMemberIdlNode
{
  constructor(scopePath: string[], node: StructMemberAstNode, idlMap: Map<string, AnyIdlNode>) {
    super(scopePath, node, idlMap);
  }

  /** Writes out ASTNode as a fully resolved IDL message definition */
  toIdlMessageDefinitionField(): IdlMessageDefinitionField {
    const msgDefinitionField: IdlMessageDefinitionField = {
      name: this.name,
      type: normalizeType(this.type),
      isComplex: this.isComplex,
    };
    if (this.arrayLengths != undefined) {
      msgDefinitionField.arrayLengths = this.arrayLengths;
    }
    if (this.arrayUpperBound != undefined) {
      msgDefinitionField.arrayUpperBound = this.arrayUpperBound;
    }
    if (this.upperBound != undefined) {
      msgDefinitionField.upperBound = this.upperBound;
    }
    if (this.annotations != undefined) {
      msgDefinitionField.annotations = this.annotations;
    }
    if (this.isArray != undefined) {
      msgDefinitionField.isArray = this.isArray;
    }

    const maybeDefault = this.annotations?.default;
    if (maybeDefault && maybeDefault.type !== "no-params") {
      const defaultValue =
        maybeDefault.type === "const-param" ? maybeDefault.value : maybeDefault.namedParams.value;
      if (typeof defaultValue !== "object") {
        msgDefinitionField.defaultValue = defaultValue;
      } else {
        msgDefinitionField.defaultValue = this.getConstantNode(defaultValue.name).value;
      }
    }

    return msgDefinitionField;
  }
}
