import { ConstantValue } from "@foxglove/message-definition";

import { BaseASTNode, ConstantASTNode, EnumASTNode } from "../astTypes";
import { SIMPLE_TYPES, normalizeType } from "../primitiveTypes";
import { IDLMessageDefinition, IDLMessageDefinitionField } from "../types";

export class IdlNode<T extends BaseASTNode = BaseASTNode> implements BaseASTNode {
  private map: Map<string, IdlNode>;
  protected readonly astNode: T;
  readonly scopePath: string[];

  constructor(scopePath: string[], astNode: T, idlMap: Map<string, IdlNode>) {
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

  get isConstant(): T["isConstant"] {
    return this.astNode.isConstant;
  }

  get annotations(): BaseASTNode["annotations"] {
    return this.astNode.annotations;
  }

  get scopedIdentifier(): string {
    return toScopedIdentifier([...this.scopePath, this.name]);
  }

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

  protected getConstantNode(identifier: string): ConstantIdlNode {
    const maybeConstantNode = this.getNode(this.scopePath, identifier);
    if (!(maybeConstantNode instanceof ConstantIdlNode)) {
      throw new Error(`Expected ${this.name} to be a constant in ${this.scopedIdentifier}`);
    }
    return maybeConstantNode;
  }
}

export class ConstantIdlNode extends IdlNode<ConstantASTNode> {
  private needsResolution = false;
  constructor(scopePath: string[], astNode: ConstantASTNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
    if (!SIMPLE_TYPES.has(astNode.type)) {
      this.needsResolution = true;
    }
  }

  get type(): string {
    if (this.needsResolution) {
      return this.getReferencedEnumNode().type;
    }
    return this.astNode.type;
  }

  private referencedEnumNode?: EnumIdlNode = undefined;
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

  get value(): ConstantValue {
    if (typeof this.astNode.value === "object") {
      return this.getConstantNode(this.astNode.value.name).value;
    }
    return this.astNode.value;
  }

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

export class EnumIdlNode extends IdlNode<EnumASTNode> {
  constructor(scopePath: string[], astNode: EnumASTNode, idlMap: Map<string, IdlNode>) {
    super(scopePath, astNode, idlMap);
  }

  get type(): string {
    return "uint32";
  }

  get isComplex(): boolean {
    return false;
  }
  get arrayLengths(): number[] | undefined {
    return undefined;
  }

  get arrayUpperBound(): number | undefined {
    return undefined;
  }

  get upperBound(): number | undefined {
    return undefined;
  }

  get isArray(): boolean | undefined {
    return undefined;
  }

  get enumerators(): ConstantIdlNode[] {
    return this.astNode.enumerators.map((enumerator) =>
      this.getConstantNode(toScopedIdentifier([...this.scopePath, this.name, enumerator])),
    );
  }

  toIDLMessageDefinition(): IDLMessageDefinition {
    const definitions = this.enumerators.map((enumerator) =>
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
