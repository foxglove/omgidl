import { ConstantValue } from "@foxglove/message-definition";

import {
  BaseASTNode,
  ConstantASTNode,
  EnumASTNode,
  ModuleASTNode,
  StructASTNode,
  StructMemberASTNode,
  TypedefASTNode,
  UnionASTNode,
} from "../astTypes";
import { Case, IDLMessageDefinition, IDLMessageDefinitionField } from "../types";

export interface IIDLNode<T extends BaseASTNode = BaseASTNode> {
  readonly scopePath: string[];
  declarator: T["declarator"];
  name: BaseASTNode["name"];
  annotations: BaseASTNode["annotations"];
  scopedIdentifier: string;
}

export interface IConstantIDLNode extends IIDLNode<ConstantASTNode> {
  type: string;
  isConstant: true;
  value: ConstantValue;
  toIDLMessageDefinitionField(): IDLMessageDefinitionField;
}

export interface IEnumIDLNode extends IIDLNode<EnumASTNode> {
  type: string;
  toIDLMessageDefinition(): IDLMessageDefinition;
}

export interface IModuleIDLNode extends IIDLNode<ModuleASTNode> {
  definitions: AnyIDLNode[];
  toIDLMessageDefinition(): IDLMessageDefinition | undefined;
}

export interface IStructIDLNode extends IIDLNode<StructASTNode> {
  type: string;
  definitions: IStructMemberIDLNode[];
  toIDLMessageDefinition(): IDLMessageDefinition;
}
export interface IReferenceTypeIDLNode<T extends TypedefASTNode | StructMemberASTNode>
  extends IIDLNode<T> {
  type: string;
  isComplex: boolean;
  enumType: string | undefined;
  isArray: boolean | undefined;
  arrayLengths: number[] | undefined;
  arrayUpperBound: number | undefined;
  upperBound: number | undefined;
}

export interface IStructMemberIDLNode extends IReferenceTypeIDLNode<StructMemberASTNode> {
  toIDLMessageDefinitionField(): IDLMessageDefinitionField;
}

export type ITypedefIDLNode = IReferenceTypeIDLNode<TypedefASTNode>;

export interface IUnionIDLNode extends IIDLNode<UnionASTNode> {
  isComplex: boolean;
  switchType: string;
  cases: Case[];
  defaultCase: IDLMessageDefinitionField | undefined;
  toIDLMessageDefinition(): IDLMessageDefinition;
}

export type AnyIDLNode =
  | IConstantIDLNode
  | IEnumIDLNode
  | IModuleIDLNode
  | IStructIDLNode
  | IStructMemberIDLNode
  | IUnionIDLNode
  | ITypedefIDLNode;
