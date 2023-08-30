import { AnyIDLNode, IConstantIDLNode, IIDLNode } from "./interfaces";
import { BaseASTNode } from "../astTypes";

/** Class used to resolve ASTNodes to IDLMessageDefinitions
 * There is a subclass of this class for each `declarator` type on the ASTNode.
 * This class is meant to provide functions and variables that exist across all of the nodes to help them resolve to complete message definitions.
 */
export abstract class IDLNode<T extends BaseASTNode = BaseASTNode> implements IIDLNode<T> {
  /** Map of all IDLNodes in a schema definition */
  protected map: Map<string, AnyIDLNode>;
  /** Unresolved node parsed directly from schema */
  protected readonly astNode: T;
  /** Array of strings that represent namespace scope that astNode is contained within. */
  readonly scopePath: string[];

  constructor(scopePath: string[], astNode: T, idlMap: Map<string, AnyIDLNode>) {
    this.scopePath = scopePath;
    this.astNode = astNode;
    this.map = idlMap;
  }

  get declarator(): T["declarator"] {
    return this.astNode.declarator;
  }

  get name(): BaseASTNode["name"] {
    return this.astNode.name;
  }

  get annotations(): BaseASTNode["annotations"] {
    return this.astNode.annotations;
  }

  /** Returns scoped identifier of the astNode: (...scopePath::name) */
  get scopedIdentifier(): string {
    return toScopedIdentifier([...this.scopePath, this.name]);
  }

  /** Gets any node in map. Fails if not found.*/
  protected getNode(scopePath: string[], name: string): AnyIDLNode {
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
  protected getConstantNode(identifier: string): IConstantIDLNode {
    const maybeConstantNode = this.getNode(this.scopePath, identifier);
    if (maybeConstantNode.declarator !== "const") {
      throw new Error(`Expected ${this.name} to be a constant in ${this.scopedIdentifier}`);
    }
    return maybeConstantNode;
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
  definitionMap: Map<string, AnyIDLNode>;
}): AnyIDLNode | undefined {
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
export function toScopedIdentifier(path: string[]): string {
  return path.join("::");
}
