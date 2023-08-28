import { EnumIdlNode, IdlNode } from "./IdlNode";
import { StructIdlNode } from "./StructIdlNode";
import { BaseASTNode, StructMemberASTNode, TypedefASTNode } from "../astTypes";
import { SIMPLE_TYPES, normalizeType } from "../primitiveTypes";
import { IDLMessageDefinitionField } from "../types";

type PossibleParentNode = StructIdlNode | TypedefIdlNode | EnumIdlNode;

export class ReferenceTypeIdlNode<
  T extends TypedefASTNode | StructMemberASTNode,
> extends IdlNode<T> {
  private needsResolution = false;
  private parentNode?: PossibleParentNode;
  constructor(scopePath: string[], astNode: T, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
    // We do not protect against circular typedefs
    if (!SIMPLE_TYPES.has(astNode.type)) {
      this.needsResolution = true;
    }
  }

  get type(): string {
    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof StructIdlNode) {
        return parent.scopedIdentifier;
      }
      return this.parent().type;
    }
    return this.astNode.type;
  }

  get isComplex(): boolean {
    return this.needsResolution ? this.parent().isComplex : false;
  }

  get isArray(): boolean | undefined {
    let isArray = this.astNode.isArray;

    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof StructIdlNode) {
        return this.astNode.isArray;
      }
      if (parent.isArray != undefined) {
        isArray = parent.isArray;
      }
    }
    return isArray;
  }

  get arrayLengths(): number[] | undefined {
    const arrayLengths = this.astNode.arrayLengths ? [...this.astNode.arrayLengths] : [];
    if (this.needsResolution) {
      const parent = this.parent();
      if (!(parent instanceof StructIdlNode) && parent.arrayLengths) {
        arrayLengths.push(...parent.arrayLengths);
      }
    }
    const finalArrayLengths: number[] = [];
    for (const arrayLength of arrayLengths) {
      if (typeof arrayLength === "object") {
        finalArrayLengths.push(this.getConstantNode(arrayLength.name).value as number);
        continue;
      }
      finalArrayLengths.push(arrayLength);
    }
    return finalArrayLengths.length > 0 ? finalArrayLengths : undefined;
  }

  get arrayUpperBound(): number | undefined {
    let arrayUpperBound = undefined;
    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof StructIdlNode) {
        return undefined;
      }
      arrayUpperBound = parent.arrayUpperBound;
    }
    // prioritize local arrayUpperBound
    if (this.astNode.arrayUpperBound != undefined) {
      arrayUpperBound = this.astNode.arrayUpperBound;
    }
    if (typeof arrayUpperBound === "object") {
      arrayUpperBound = this.getConstantNode(arrayUpperBound.name).value as number;
    }
    return arrayUpperBound;
  }

  get upperBound(): number | undefined {
    let upperBound = undefined;
    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof StructIdlNode) {
        return undefined;
      }
      return parent.upperBound;
    }
    if (this.astNode.upperBound != undefined) {
      upperBound = this.astNode.upperBound;
    }
    if (typeof upperBound === "object") {
      upperBound = this.getConstantNode(upperBound.name).value as number;
    }
    return upperBound;
  }

  get annotations(): BaseASTNode["annotations"] {
    let annotations = undefined;
    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof StructIdlNode) {
        return undefined;
      }
      if (parent.annotations != undefined) {
        annotations = { ...parent.annotations };
      }
    }
    if (this.astNode.annotations != undefined) {
      annotations = { ...annotations, ...this.astNode.annotations };
    }
    return annotations;
  }

  getValidFieldReference(typeName: string): PossibleParentNode {
    const maybeValidParent = this.getNode(this.scopePath, typeName);
    if (
      !(maybeValidParent instanceof StructIdlNode) &&
      !(maybeValidParent instanceof TypedefIdlNode) &&
      !(maybeValidParent instanceof EnumIdlNode)
    ) {
      throw new Error(
        `Expected ${typeName} to be non-module, non-constant type in ${this.scopedIdentifier}`,
      );
    }
    return maybeValidParent;
  }

  private parent(): PossibleParentNode {
    if (this.parentNode == undefined) {
      this.parentNode = this.getValidFieldReference(this.astNode.type);
    }
    // check potential errors
    if (this.astNode.isArray === true && this.parentNode.isArray === true) {
      const thisNodeIsFixedSize = this.astNode.arrayLengths != undefined;
      const parentNodeIsFixedSize = this.parentNode.arrayLengths != undefined;
      if (thisNodeIsFixedSize !== parentNodeIsFixedSize) {
        throw new Error(
          `Cannot mix fixed and variable length arrays in ${this.scopedIdentifier} referencing ${this.parentNode.scopedIdentifier}`,
        );
      }
    }

    return this.parentNode;
  }
}

export class TypedefIdlNode extends ReferenceTypeIdlNode<TypedefASTNode> {
  constructor(scopePath: string[], astNode: TypedefASTNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }
}

export class StructMemberIdlNode extends ReferenceTypeIdlNode<StructMemberASTNode> {
  constructor(scopePath: string[], node: StructMemberASTNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, node, idlMap);
  }

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
