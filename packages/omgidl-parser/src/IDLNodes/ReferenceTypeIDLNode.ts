import { IDLNode } from "./IDLNode";
import {
  AnyIDLNode,
  IEnumIDLNode,
  IReferenceTypeIDLNode,
  IStructIDLNode,
  IUnionIDLNode,
} from "./interfaces";
import {
  BaseASTNode,
  StructMemberASTNode,
  TypedefASTNode,
  UnresolvedConstantValue,
} from "../astTypes";
import { SIMPLE_TYPES } from "../primitiveTypes";

type PossibleTypeRefNode =
  | IStructIDLNode
  | IReferenceTypeIDLNode<TypedefASTNode>
  | IEnumIDLNode
  | IUnionIDLNode;

/** Class used for struct members and typedefs because they can reference each other and other types (enum and struct)
 * This class resolves the fields of these types to their final values.
 */
export abstract class ReferenceTypeIDLNode<T extends TypedefASTNode | StructMemberASTNode>
  extends IDLNode<T>
  implements IReferenceTypeIDLNode<T>
{
  /** Indicates that it references another typedef, enum or struct. (ie: uses a non-builtin / simple type) */
  private typeNeedsResolution = false;
  /** Used to hold an optional referenced node if needsResolution==true. Resolved/Set with `typeRef()` function.
   * Not meant to be used outside of `typeRef()` function.
   */
  private typeRefNode?: PossibleTypeRefNode;
  constructor(scopePath: string[], astNode: T, idlMap: Map<string, AnyIDLNode>) {
    super(scopePath, astNode, idlMap);
    if (!SIMPLE_TYPES.has(astNode.type)) {
      this.typeNeedsResolution = true;
    }
  }

  get type(): string {
    if (this.typeNeedsResolution) {
      const parent = this.typeRef();
      if (parent.declarator === "typedef" || parent.declarator === "enum") {
        return parent.type;
      }
      return parent.scopedIdentifier;
    }
    return this.astNode.type;
  }

  get isComplex(): boolean {
    if (!this.typeNeedsResolution) {
      return false;
    }
    const parent = this.typeRef();
    if (parent.declarator === "typedef") {
      return parent.isComplex;
    }
    return parent.declarator === "struct" || parent.declarator === "union";
  }

  get enumType(): string | undefined {
    if (this.typeNeedsResolution) {
      const parent = this.typeRef();
      if (parent.declarator === "enum") {
        return parent.scopedIdentifier;
      }
    }
    return undefined;
  }

  get isArray(): boolean | undefined {
    let isArray = this.astNode.isArray;

    if (this.typeNeedsResolution) {
      const parent = this.typeRef();
      if (parent.declarator === "typedef") {
        isArray ||= parent.isArray;
      }
    }
    return isArray;
  }

  get arrayLengths(): number[] | undefined {
    // Arraylengths are composed such that the prior arrayLengths describe the outermost arrays.
    // This means that the arrayLengths on the typedef should be pushed to the end as innermost arrayLengths.
    const arrayLengths = this.astNode.arrayLengths ? [...this.astNode.arrayLengths] : [];
    if (this.typeNeedsResolution) {
      const parent = this.typeRef();
      if (parent.declarator === "typedef" && parent.arrayLengths) {
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
    if (this.typeNeedsResolution) {
      const parent = this.typeRef();
      if (parent.declarator === "typedef") {
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
    if (this.typeNeedsResolution) {
      const parent = this.typeRef();
      if (parent.declarator === "typedef") {
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

  get annotations(): BaseASTNode["annotations"] {
    let annotations = undefined;
    if (this.typeNeedsResolution) {
      const parent = this.typeRef();
      // We do not want to inherit annotations from a struct or enum
      if (parent.declarator === "typedef" && parent.annotations != undefined) {
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

  /** Gets Node with the given name in the current instance's scope and checks that it is a valid type reference node */
  private getValidTypeReference(typeName: string): PossibleTypeRefNode {
    const maybeValidParent = this.getNode(this.scopePath, typeName);
    if (
      !(maybeValidParent.declarator === "struct") &&
      !(maybeValidParent.declarator === "typedef") &&
      !(maybeValidParent.declarator === "union") &&
      !(maybeValidParent.declarator === "enum")
    ) {
      throw new Error(
        `Expected ${typeName} to be non-module, non-constant type in ${this.scopedIdentifier}`,
      );
    }
    return maybeValidParent;
  }

  /** Resolves to a type reference node value or fails if one is not found.
   * Only to be used when needsResolution==true and the `type` on the astNode is not "simple".
   * Also checks the parent against current serialization limitations. (ie: we do not support composing variable length arrays with typedefs)
   */
  private typeRef(): PossibleTypeRefNode {
    if (this.typeRefNode == undefined) {
      this.typeRefNode = this.getValidTypeReference(this.astNode.type);
    }

    if (!(this.typeRefNode instanceof ReferenceTypeIDLNode)) {
      return this.typeRefNode;
    }

    // check potential errors
    if (this.astNode.isArray === true && this.typeRefNode.isArray === true) {
      const thisNodeIsFixedSize = this.astNode.arrayLengths != undefined;
      const parentNodeIsFixedSize = this.typeRefNode.arrayLengths != undefined;
      if (!thisNodeIsFixedSize || !parentNodeIsFixedSize) {
        throw new Error(
          `We do not support composing variable length arrays with typedefs: ${this.scopedIdentifier} referencing ${this.typeRefNode.scopedIdentifier}`,
        );
      }
    }

    return this.typeRefNode;
  }
}
