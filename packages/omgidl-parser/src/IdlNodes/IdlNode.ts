import { ConstantValue } from "@foxglove/message-definition";

import { BaseAstNode, ConstantAstNode, EnumAstNode } from "../astTypes";
import { SIMPLE_TYPES, normalizeType } from "../primitiveTypes";
import { IDLMessageDefinition as IdlMessageDefinition, IDLMessageDefinitionField } from "../types";

/** NOTE: All of the classes in this file are included such that we don't have circular import issues */

/** Class used to resolve ASTNodes to IDLMessageDefinitions */
export class IdlNode<T extends BaseAstNode = BaseAstNode> {
  /** Map of all IdlNodes in a schema definition */
  private map: Map<string, IdlNode>;
  /** Unresolved node parsed directly from schema */
  protected readonly astNode: T;
  /** Array of strings that represent namespace scope that astNode is contained within. */
  readonly scopePath: string[];

  constructor(scopePath: string[], astNode: T, idlMap: Map<string, IdlNode>) {
    this.scopePath = scopePath;
    this.astNode = astNode;
    this.map = idlMap;
  }

  get declarator(): T["declarator"] {
    return this.astNode.declarator;
  }

  get name(): BaseAstNode["name"] {
    return this.astNode.name;
  }

  get annotations(): BaseAstNode["annotations"] {
    return this.astNode.annotations;
  }

  /** Returns scoped identifier of the astNode: (...scopePath::name) */
  get scopedIdentifier(): string {
    return toScopedIdentifier([...this.scopePath, this.name]);
  }

  /** Gets any node in map. Fails if not found.*/
  protected getNode(scopePath: string[], name: string): IdlNode {
    const maybeNode = resolveScopedOrLocalNodeReference({
      usedIdentifier: name,
      scopeOfUsage: scopePath,
      definitionMap: this.map,
    });
    if (maybeNode == undefined) {
      throw new Error(
        `Could not find node ${name} in ${scopePath.join("::")} referenced by ${
          this.scopedIdentifier
        }`,
      );
    }
    return maybeNode;
  }

  /** Gets a constant node under a local-to-this-node or scoped identifier. Fails if not a ConstantNode */
  protected getConstantNode(identifier: string): ConstantIdlNode {
    const maybeConstantNode = this.getNode(this.scopePath, identifier);
    if (!(maybeConstantNode instanceof ConstantIdlNode)) {
      throw new Error(`Expected ${this.name} to be a constant in ${this.scopedIdentifier}`);
    }
    return maybeConstantNode;
  }
}

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

/** Class used to resolve an Enum ASTNode to an IdlMessageDefinition */
export class EnumIdlNode extends IdlNode<EnumAstNode> {
  constructor(scopePath: string[], astNode: EnumAstNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return "uint32";
  }

  private enumeratorNodes(): ConstantIdlNode[] {
    return this.astNode.enumerators.map((enumerator) =>
      this.getConstantNode(toScopedIdentifier([...this.scopePath, this.name, enumerator])),
    );
  }

  public toIdlMessageDefinition(): IdlMessageDefinition {
    const definitions = this.enumeratorNodes().map((enumerator) =>
      enumerator.toIDLMessageDefinitionField(),
    );
    return {
      name: toScopedIdentifier([...this.scopePath, this.name]),
      definitions,
      // Going to use the module aggregated kind since that's what we store constants in
      aggregatedKind: "module",
    };
  }
}

/** Takes a potentially scope-less name used in a given scope and attempts to find the Node in the map
 * that matches it's name in the local scope or any larger encapsulating scope.
 * For example:
 * ```Cpp
 * module foo {
 * typedef customType uint32;
 * module bar {
 *   customType FooBar;
 *   foo::customType BarFoo;
 * };
 * };
 * ```
 * Both of these usages of customType should resolve given this function.
 */
function resolveScopedOrLocalNodeReference({
  usedIdentifier,
  scopeOfUsage,
  definitionMap,
}: {
  usedIdentifier: string;
  scopeOfUsage: string[];
  definitionMap: Map<string, IdlNode>;
}): IdlNode | undefined {
  // If using local un-scoped identifier, it will not be found in the definitions map
  // In this case we try by building up the namespace prefix until we find a match
  let referencedNode = undefined;
  const namespacePrefixes = [...scopeOfUsage];
  const currPrefix: string[] = [];
  for (;;) {
    const identifierToTry = toScopedIdentifier([...currPrefix, usedIdentifier]);
    referencedNode = definitionMap.get(identifierToTry);
    if (referencedNode != undefined) {
      break;
    }
    if (namespacePrefixes.length === 0) {
      break;
    }
    currPrefix.push(namespacePrefixes.shift()!);
  }

  return referencedNode;
}
function toScopedIdentifier(path: string[]): string {
  return path.join("::");
}
