import { ConstantValue } from "@foxglove/message-definition";

import { IDLDefinitionMap, toScopedIdentifier } from "./IDLDefinitionMap";
import { SIMPLE_TYPES, normalizeType } from "./primitiveTypes";
import {
  BaseASTNode,
  ConstantASTNode,
  EnumASTNode,
  IDLMessageDefinition,
  IDLMessageDefinitionField,
} from "./types";

export class IDLNode<T extends BaseASTNode = BaseASTNode> implements BaseASTNode {
  private map: IDLDefinitionMap;
  protected readonly astNode: T;
  readonly scopePath: string[];

  constructor(scopePath: string[], astNode: T, idlMap: IDLDefinitionMap) {
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

  protected getNode(scopePath: string[], name: string): IDLNode {
    const maybeNode = this.map.getNode(scopePath, name);
    if (maybeNode == undefined) {
      throw new Error(
        `Could not find node ${name} in ${scopePath.join("::")} referenced by ${
          this.scopedIdentifier
        }`,
      );
    }
    return maybeNode;
  }

  protected getConstantNode(identifier: string): IDLConstantNode {
    const maybeConstantNode = this.getNode(this.scopePath, identifier);
    if (!(maybeConstantNode instanceof IDLConstantNode)) {
      throw new Error(`Expected ${this.name} to be a constant in ${this.scopedIdentifier}`);
    }
    return maybeConstantNode;
  }
}

export class IDLConstantNode extends IDLNode<ConstantASTNode> {
  private needsResolution = false;
  constructor(scopePath: string[], astNode: ConstantASTNode, idlMap: IDLDefinitionMap) {
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

  private referencedEnumNode?: IDLEnumNode = undefined;
  private getReferencedEnumNode(): IDLEnumNode {
    if (this.referencedEnumNode == undefined) {
      const maybeEnumNode = this.getNode(this.scopePath, this.astNode.type);
      if (!(maybeEnumNode instanceof IDLEnumNode)) {
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

export class IDLEnumNode extends IDLNode<EnumASTNode> {
  constructor(scopePath: string[], astNode: EnumASTNode, idlMap: IDLDefinitionMap) {
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

  get enumerators(): IDLConstantNode[] {
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
