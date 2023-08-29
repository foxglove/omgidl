import { EnumIdlNode, IdlNode } from "./IdlNode";
import { StructIdlNode } from "./StructIdlNode";
import {
  BaseAstNode,
  StructMemberAstNode,
  TypedefAstNode,
  UnresolvedConstantValue,
} from "../astTypes";
import { SIMPLE_TYPES, normalizeType } from "../primitiveTypes";
import { IdlMessageDefinitionField } from "../types";

type PossibleParentNode = StructIdlNode | TypedefIdlNode | EnumIdlNode;

/** Class used for struct members and typedefs because they can reference each other and other types (enum and struct)
 * This class resolves the fields of these types to their final values.
 */
export class ReferenceTypeIdlNode<
  T extends TypedefAstNode | StructMemberAstNode,
> extends IdlNode<T> {
  /** Indicates that it references another typedef, enum or struct. (ie: uses a non-builtin / simple type) */
  private needsResolution = false;
  /** Used to hold an optional parent/referenced node if needsResolution==true. Resolved/Set with `parent()` function.
   * Not meant to be used outside of `parent()` function.
   */
  private parentNode?: PossibleParentNode;
  constructor(scopePath: string[], astNode: T, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
    if (!SIMPLE_TYPES.has(astNode.type)) {
      this.needsResolution = true;
    }
  }

  get type(): string {
    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof TypedefIdlNode || parent instanceof EnumIdlNode) {
        return parent.type;
      }
      return parent.scopedIdentifier;
    }
    return this.astNode.type;
  }

  get isComplex(): boolean {
    if (!this.needsResolution) {
      return false;
    }
    const parent = this.parent();
    if (parent instanceof TypedefIdlNode) {
      return parent.isComplex;
    }
    return parent instanceof StructIdlNode;
  }

  get isArray(): boolean | undefined {
    let isArray = this.astNode.isArray;

    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof TypedefIdlNode) {
        isArray ||= parent.isArray;
      }
    }
    return isArray;
  }

  get arrayLengths(): number[] | undefined {
    // Arraylengths are composed such that the prior arrayLengths describe the outermost arrays.
    // This means that the arrayLengths on the typedef should be pushed to the end as innermost arrayLengths.
    const arrayLengths = this.astNode.arrayLengths ? [...this.astNode.arrayLengths] : [];
    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof TypedefIdlNode && parent.arrayLengths) {
        arrayLengths.push(...parent.arrayLengths);
      }
    }
    const finalArrayLengths: number[] = [];
    // Resolve constant usage in arraylengths
    for (const arrayLength of arrayLengths) {
      const resolvedArrayLength = this.resolvePossibleNumericConstantUsage(arrayLength);
      // Shouldn't return undefined since the arrayLengths array should never include undefined
      if (resolvedArrayLength != undefined) {
        finalArrayLengths.push(resolvedArrayLength);
      }
    }
    return finalArrayLengths.length > 0 ? finalArrayLengths : undefined;
  }

  get arrayUpperBound(): number | undefined {
    let arrayUpperBound = undefined;
    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof TypedefIdlNode) {
        arrayUpperBound = parent.arrayUpperBound;
      }
    }
    if (this.astNode.arrayUpperBound != undefined) {
      // Note: we forbid variable length array composition, so this won't be overriding the parent value
      arrayUpperBound = this.astNode.arrayUpperBound;
    }

    return this.resolvePossibleNumericConstantUsage(arrayUpperBound);
  }

  get upperBound(): number | undefined {
    let upperBound = undefined;
    if (this.needsResolution) {
      const parent = this.parent();
      if (parent instanceof TypedefIdlNode) {
        upperBound = parent.upperBound;
      }
    }
    if (this.astNode.upperBound != undefined) {
      // Note: we forbid variable length array composition, so this won't be overriding the parent value
      upperBound = this.astNode.upperBound;
    }
    // Check for constant usage
    return this.resolvePossibleNumericConstantUsage(upperBound);
  }

  get annotations(): BaseAstNode["annotations"] {
    let annotations = undefined;
    if (this.needsResolution) {
      const parent = this.parent();
      // We do not want to inherit annotations from a struct or enum
      if (parent instanceof TypedefIdlNode && parent.annotations != undefined) {
        annotations = { ...parent.annotations };
      }
    }
    if (this.astNode.annotations != undefined) {
      // prioritize the astNode annotations
      annotations = { ...annotations, ...this.astNode.annotations };
    }
    return annotations;
  }

  private resolvePossibleNumericConstantUsage(
    astValue: UnresolvedConstantValue | number | undefined,
  ): number | undefined {
    if (typeof astValue === "number" || astValue == undefined) {
      return astValue;
    }
    const constantNodeIdentifier = astValue.name;
    const constantNodeValue = this.getConstantNode(constantNodeIdentifier).value!; // should never be undefined
    if (typeof constantNodeValue !== "number") {
      throw Error(
        `Expected constant value ${constantNodeIdentifier} in ${
          this.scopedIdentifier
        } to be a number, but got ${constantNodeValue.toString()}`,
      );
    }
    return constantNodeValue;
  }

  /** Gets Node with the given name in the current instance's scope and checks that it is a valid parent/reference node */
  private getValidFieldReference(typeName: string): PossibleParentNode {
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

  /** Resolves to a parent value or fails if one is not found.
   * Only to be used when needsResolution==true and the `type` on the astNode is not "simple".
   * Also checks the parent against current serialization limitations. (ie: we do not support composing variable length arrays with typedefs)
   */
  private parent(): PossibleParentNode {
    if (this.parentNode == undefined) {
      this.parentNode = this.getValidFieldReference(this.astNode.type);
    }

    if (!(this.parentNode instanceof TypedefIdlNode)) {
      return this.parentNode;
    }

    // check potential errors
    if (this.astNode.isArray === true && this.parentNode.isArray === true) {
      const thisNodeIsFixedSize = this.astNode.arrayLengths != undefined;
      const parentNodeIsFixedSize = this.parentNode.arrayLengths != undefined;
      if (!thisNodeIsFixedSize || !parentNodeIsFixedSize) {
        throw new Error(
          `We do not support composing variable length arrays with typedefs: ${this.scopedIdentifier} referencing ${this.parentNode.scopedIdentifier}`,
        );
      }
    }

    return this.parentNode;
  }
}

export class TypedefIdlNode extends ReferenceTypeIdlNode<TypedefAstNode> {
  constructor(scopePath: string[], astNode: TypedefAstNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }
}

export class StructMemberIdlNode extends ReferenceTypeIdlNode<StructMemberAstNode> {
  constructor(scopePath: string[], node: StructMemberAstNode, idlMap: Map<string, IdlNode>) {
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
