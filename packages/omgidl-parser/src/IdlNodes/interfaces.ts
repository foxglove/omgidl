import { ConstantValue } from "@foxglove/message-definition";

import {
  BaseAstNode,
  ConstantAstNode,
  EnumAstNode,
  ModuleAstNode,
  StructAstNode,
  StructMemberAstNode,
  TypedefAstNode,
} from "../astTypes";
import { IdlMessageDefinition, IdlMessageDefinitionField } from "../types";

export interface IIdlNode<T extends BaseAstNode = BaseAstNode> {
  readonly scopePath: string[];
  declarator: T["declarator"];
  name: BaseAstNode["name"];
  annotations: BaseAstNode["annotations"];
  scopedIdentifier: string;
}

export interface IConstantIdlNode extends IIdlNode<ConstantAstNode> {
  type: string;
  isConstant: true;
  value: ConstantValue;
  toIdlMessageDefinitionField(): IdlMessageDefinitionField;
}

export interface IEnumIdlNode extends IIdlNode<EnumAstNode> {
  type: string;
  toIdlMessageDefinition(): IdlMessageDefinition;
}

export interface IModuleIdlNode extends IIdlNode<ModuleAstNode> {
  definitions: AnyIdlNode[];
  toIdlMessageDefinition(): IdlMessageDefinition | undefined;
}

export interface IStructIdlNode extends IIdlNode<StructAstNode> {
  type: string;
  definitions: IStructMemberIdlNode[];
  toIdlMessageDefinition(): IdlMessageDefinition;
}
export interface IReferenceTypeIdlNode<T extends TypedefAstNode | StructMemberAstNode>
  extends IIdlNode<T> {
  type: string;
  isComplex: boolean;
  isArray: boolean | undefined;
  arrayLengths: number[] | undefined;
  arrayUpperBound: number | undefined;
  upperBound: number | undefined;
}

export interface IStructMemberIdlNode extends IReferenceTypeIdlNode<StructMemberAstNode> {
  toIdlMessageDefinitionField(): IdlMessageDefinitionField;
}

export type ITypedefIdlNode = IReferenceTypeIdlNode<TypedefAstNode>;

export type AnyIdlNode =
  | IConstantIdlNode
  | IEnumIdlNode
  | IModuleIdlNode
  | IStructIdlNode
  | IStructMemberIdlNode
  | ITypedefIdlNode;
