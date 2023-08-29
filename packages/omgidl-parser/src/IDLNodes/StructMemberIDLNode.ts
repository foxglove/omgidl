import { ReferenceTypeIDLNode } from "./ReferenceTypeIDLNode";
import { AnyIDLNode, IStructMemberIDLNode } from "./interfaces";
import { StructMemberASTNode } from "../astTypes";
import { normalizeType } from "../primitiveTypes";
import { IDLMessageDefinitionField } from "../types";

export class StructMemberIDLNode
  extends ReferenceTypeIDLNode<StructMemberASTNode>
  implements IStructMemberIDLNode
{
  constructor(scopePath: string[], node: StructMemberASTNode, idlMap: Map<string, AnyIDLNode>) {
    super(scopePath, node, idlMap);
  }

  /** Writes out ASTNode as a fully resolved IDL message definition */
  toIDLMessageDefinitionField(): IDLMessageDefinitionField {
    const msgDefinitionField: IDLMessageDefinitionField = {
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
