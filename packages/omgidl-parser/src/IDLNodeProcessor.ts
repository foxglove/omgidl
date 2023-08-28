import {
  ConstantValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";

import {
  RawIdlDefinition,
  AnyASTNode,
  ConstantASTNode,
  IDLMessageDefinition,
  IDLMessageDefinitionField,
  DefinitionFieldASTNode,
} from "./types";

const numericTypeMap: Record<string, string> = {
  "unsigned short": "uint16",
  "unsigned long": "uint32",
  "unsigned long long": "uint64",
  short: "int16",
  long: "int32",
  "long long": "int64",
  double: "float64",
  float: "float32",
  octet: "uint8",
  wchar: "uint8",
  char: "uint8",
  byte: "int8",
};

const SIMPLE_TYPES = new Set([
  "bool",
  "string",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  ...Object.keys(numericTypeMap),
]);

const POSSIBLE_UNRESOLVED_MEMBERS = [
  "arrayLengths",
  "upperBound",
  "arrayUpperBound",
  "value",
] as const;

/** Class used for processing and resolving raw IDL node definitions */
export class IDLNodeProcessor {
  definitions: RawIdlDefinition[];
  map: Map<string, AnyASTNode>;
  firstStructName?: string;

  constructor(definitions: RawIdlDefinition[]) {
    this.definitions = definitions;
    this.map = new Map();
    this.buildMap();
  }

  /** Initializes map of IDL nodes to their scoped namespaces */
  buildMap(): void {
    for (const definition of this.definitions) {
      // build flattened definition map
      traverseIdl([definition], (path) => {
        const node = path[path.length - 1]!;
        const namePath = path.map((n) => n.name);

        this.map.set(toScopedIdentifier(namePath), node);
        // expand enums into constants for usage downstream
        if (node.declarator === "enum") {
          const enumConstants = node.enumerators.map((m: string, i: number) => ({
            declarator: "const" as const,
            isConstant: true as const,
            name: m,
            type: "unsigned long",
            value: i as ConstantValue,
            isComplex: false,
          }));
          for (const constant of enumConstants) {
            this.map.set(toScopedIdentifier([...namePath, constant.name]), constant);
          }
        }
      });
    }
  }

  /** Resolve enum types to uint32 */
  resolveEnumTypes(): void {
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (
        node.declarator !== "typedef" &&
        node.declarator !== "struct-member" &&
        node.declarator !== "const"
      ) {
        continue;
      }
      const type = node.type;
      if (SIMPLE_TYPES.has(type)) {
        continue;
      }
      const typeNode = resolveScopedOrLocalNodeReference({
        usedIdentifier: type,
        scopedIdentifierOfUsageNode: scopedIdentifier,
        definitionMap: this.map,
      });
      if (!typeNode) {
        throw new Error(
          `Could not find type <${type}> for ${node.declarator} <${
            node.name ?? "undefined"
          }> in <${getParentScopedIdentifier(scopedIdentifier)}>`,
        );
      }
      if (typeNode.declarator === "enum") {
        this.map.set(scopedIdentifier, { ...node, type: "unsigned long", isComplex: false });
      }
    }
  }

  /** Resolves constants to their final literal values when used in typedefs, struct-members, and other constants */
  resolveConstantUsage(): void {
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (
        node.declarator !== "struct-member" &&
        node.declarator !== "typedef" &&
        node.declarator !== "const"
      ) {
        continue;
      }
      const newNode = this.resolveField(scopedIdentifier, node);
      this.map.set(scopedIdentifier, newNode);
    }
  }

  private resolveField(
    scopedIdentifier: string,
    unresolvedField: DefinitionFieldASTNode,
  ): DefinitionFieldASTNode {
    const node = { ...unresolvedField };
    // need to iterate through keys because this can occur on arrayLength, upperBound, arrayUpperBound, value, defaultValue
    for (const key of POSSIBLE_UNRESOLVED_MEMBERS) {
      const keyValue = unresolvedField[key];
      let finalKeyValue = undefined;
      if (Array.isArray(keyValue)) {
        const arrayLengths = keyValue;
        const finalArrayLengths = arrayLengths.map((arrayLength) =>
          typeof arrayLength === "number"
            ? arrayLength
            : this.resolveConstantValue({
                constantName: arrayLength.name,
                nodeScopedIdentifier: scopedIdentifier,
              }),
        );
        finalKeyValue = finalArrayLengths;
      } else if (typeof keyValue === "object") {
        finalKeyValue = this.resolveConstantValue({
          constantName: keyValue.name,
          nodeScopedIdentifier: scopedIdentifier,
        });
      }

      if (finalKeyValue == undefined) {
        continue;
      }
      (node[key] as ConstantValue | ConstantValue[]) = finalKeyValue;
    }
    return node;
  }

  private resolveConstantValue({
    constantName,
    nodeScopedIdentifier,
  }: {
    constantName: string;
    nodeScopedIdentifier: string;
  }): ConstantValue {
    const constantNode = this.resolveConstantReference({
      constantName,
      nodeScopedIdentifier,
    });

    return constantNode.value as ConstantValue;
  }

  private resolveConstantReference({
    constantName,
    nodeScopedIdentifier,
  }: {
    constantName: string;
    nodeScopedIdentifier: string;
  }): ConstantASTNode {
    const constantNode = resolveScopedOrLocalNodeReference({
      usedIdentifier: constantName,
      scopedIdentifierOfUsageNode: nodeScopedIdentifier,
      definitionMap: this.map,
    });
    // need to make sure we are updating the most up to date node
    if (!constantNode || constantNode.declarator !== "const") {
      throw new Error(
        `Could not find constant <${constantName}> used in <${nodeScopedIdentifier}>`,
      );
    }
    return constantNode;
  }

  /**  Resolve typedefs that reference structs as complex*/
  resolveTypeDefComplexity(): void {
    // assume that typedefs can't reference other typedefs
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (node.declarator !== "typedef") {
        continue;
      }
      const type = node.type;
      if (SIMPLE_TYPES.has(type)) {
        continue;
      }
      const typeNode = resolveScopedOrLocalNodeReference({
        usedIdentifier: type,
        scopedIdentifierOfUsageNode: scopedIdentifier,
        definitionMap: this.map,
      });
      if (!typeNode) {
        throw new Error(
          `Could not find type <${type}> for field <${node.name ?? "undefined"}> in <${node.name}>`,
        );
      }
      if (typeNode.declarator === "typedef") {
        // To fully support this we would need to either make multiple passes or recursively resolve typedefs
        throw new Error(
          `We do not support typedefs that reference other typedefs ${node.name} -> ${type}`,
        );
      }
      if (typeNode.declarator === "struct" || typeNode.declarator === "union") {
        this.map.set(scopedIdentifier, { ...node, isComplex: true });
      }
    }
  }

  /** Resolve struct-members definitions that use typedefs or reference other complex types */
  resolveStructMember(): void {
    // resolve non-primitive struct member types
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (node.declarator !== "struct-member") {
        continue;
      }
      const type = node.type;
      if (SIMPLE_TYPES.has(type)) {
        continue;
      }

      const typeNode = resolveScopedOrLocalNodeReference({
        usedIdentifier: type,
        scopedIdentifierOfUsageNode: scopedIdentifier,
        definitionMap: this.map,
      });
      if (!typeNode) {
        throw new Error(
          `Could not find type <${type}> for field <${node.name ?? "undefined"}> in <${node.name}>`,
        );
      }
      if (typeNode.declarator === "typedef") {
        // apply typedef definition to struct member
        const {
          declarator: _d,
          name: _name,
          annotations: typedefAnnotations,
          arrayLengths: typedefArrayLengths,
          ...partialDef
        } = typeNode;

        const newNode = {
          ...node,
          ...partialDef,
        };
        if (typedefArrayLengths) {
          const arrayLengths = [];
          if (node.arrayLengths) {
            // important that node arrayLengths are pushed first to maintain dimensional order: outermost first
            arrayLengths.push(...node.arrayLengths);
          }
          arrayLengths.push(...typedefArrayLengths);
          newNode.arrayLengths = arrayLengths;
        }

        const annotations = { ...typedefAnnotations, ...node.annotations };
        if (Object.keys(annotations).length > 0) {
          newNode.annotations = annotations;
        }

        this.map.set(scopedIdentifier, newNode);
      } else if (typeNode.declarator === "struct") {
        this.map.set(scopedIdentifier, { ...node, isComplex: true });
      } else {
        throw new Error(
          `Unexpected type <${typeNode.declarator}> for  <${node.name}>. Must be typedef or struct`,
        );
      }
    }
  }

  toMessageDefinitions(): MessageDefinition[] {
    const idlMsgDefs = this.toIDLMessageDefinitions();

    return idlMsgDefs.map(toMessageDefinition);
  }

  /** Convert to Message Definitions for serialization and usage in foxglove studio's Raw Message panel. Returned in order of original definitions*/
  toIDLMessageDefinitions(): IDLMessageDefinition[] {
    const messageDefinitions: IDLMessageDefinition[] = [];
    const topLevelConstantDefinitions: MessageDefinitionField[] = [];

    // flatten for output to message definition
    // Because the map entries are in original insertion order, they should reflect the original order of the definitions
    // This is important for ros2idl compatibility
    for (const [namespacedName, node] of this.map.entries()) {
      if (
        node.declarator === "struct" ||
        node.declarator === "module" ||
        node.declarator === "enum"
      ) {
        const isEnum = node.declarator === "enum";
        const members = isEnum ? node.enumerators : node.definitions;
        const definitionFields = members
          .map((def) =>
            this.idlNodeToMessageDefinitionField(
              toScopedIdentifier([namespacedName, typeof def === "string" ? def : def.name]),
            ),
          )
          .filter(Boolean) as IDLMessageDefinitionField[];
        if (definitionFields.length > 0) {
          const def: IDLMessageDefinition = {
            aggregatedKind: "struct",
            name: namespacedName,
            definitions: definitionFields,
          };

          if (node.annotations) {
            def.annotations = node.annotations;
          }
          messageDefinitions.push(def);
        }
      } else if (node.name === namespacedName && node.isConstant === true) {
        // handles top-level constants that aren't within a module
        const fieldDefinition = this.idlNodeToMessageDefinitionField(node.name);
        if (fieldDefinition) {
          topLevelConstantDefinitions.push(fieldDefinition);
        }
      }
    }

    if (topLevelConstantDefinitions.length > 0) {
      messageDefinitions.push({
        name: "",
        aggregatedKind: "struct",
        definitions: topLevelConstantDefinitions,
      });
    }

    return messageDefinitions;
  }

  private idlNodeToMessageDefinitionField(
    nodeScopedIdentifier: string,
  ): IDLMessageDefinitionField | undefined {
    const node = this.map.get(nodeScopedIdentifier);
    if (!node) {
      return undefined;
    }
    if (node.declarator !== "struct-member" && node.declarator !== "const") {
      return undefined;
    }
    const {
      declarator: _d,
      arrayLengths,
      arrayUpperBound,
      upperBound,
      value,
      annotations,
      ...partialMessageDef
    } = node;

    if (
      typeof arrayUpperBound === "object" ||
      typeof upperBound === "object" ||
      typeof value === "object"
    ) {
      throw Error(`Constants not resolved for ${nodeScopedIdentifier}`);
    }

    if (arrayLengths?.find((len) => typeof len === "object") != undefined) {
      throw Error(`Constants not resolved for ${nodeScopedIdentifier}`);
    }

    const fullMessageDef = {
      ...partialMessageDef,
      type: normalizeType(partialMessageDef.type),
    } as IDLMessageDefinitionField;

    // avoid writing undefined to object fields
    if (arrayLengths != undefined) {
      fullMessageDef.arrayLengths = arrayLengths as number[];
    }
    if (arrayUpperBound != undefined) {
      fullMessageDef.arrayUpperBound = arrayUpperBound;
    }
    if (upperBound != undefined) {
      fullMessageDef.upperBound = upperBound;
    }
    if (value != undefined) {
      fullMessageDef.value = value;
    }

    const maybeDefault = annotations?.default;
    if (maybeDefault && maybeDefault.type !== "no-params") {
      const defaultValue =
        maybeDefault.type === "const-param" ? maybeDefault.value : maybeDefault.namedParams.value;
      if (typeof defaultValue !== "object") {
        fullMessageDef.defaultValue = defaultValue;
      } else {
        // We need to do resolve this here for now instead of in `resolveConstants`
        // because the annotations could be supplied by a typedef that is not resolved until later
        const defaultValueNode = this.resolveConstantReference({
          constantName: defaultValue.name,
          nodeScopedIdentifier,
        });
        if (typeof defaultValueNode.value === "object") {
          throw new Error(`Did not resolve default value for ${nodeScopedIdentifier}`);
        }
        fullMessageDef.defaultValue = defaultValueNode.value;
      }
    }

    if (annotations) {
      fullMessageDef.annotations = annotations;
    }

    return fullMessageDef;
  }
}

// Removes `annotation` field from the Definition and DefinitionField objects
function toMessageDefinition(idlMsgDef: IDLMessageDefinition): MessageDefinition {
  if (idlMsgDef.aggregatedKind === "union") {
    throw new Error(`Unions are not supported in MessageDefinition type`);
  }
  const { definitions, annotations: _a, ...partialDef } = idlMsgDef;
  const fieldDefinitions = definitions.map((def) => {
    const { annotations: _an, arrayLengths, ...partialFieldDef } = def;
    const fieldDef = { ...partialFieldDef };
    if (arrayLengths != undefined) {
      if (arrayLengths.length > 1) {
        throw new Error(`Multi-dimensional arrays are not supported in MessageDefinition type`);
      }
      const [arrayLength] = arrayLengths;

      (fieldDef as MessageDefinitionField).arrayLength = arrayLength;
    }
    return fieldDef;
  });

  return { ...partialDef, definitions: fieldDefinitions };
}

export function resolveScopedOrLocalNodeReference({
  usedIdentifier,
  scopedIdentifierOfUsageNode,
  definitionMap,
}: {
  usedIdentifier: string;
  scopedIdentifierOfUsageNode: string;
  definitionMap: Map<string, AnyASTNode>;
}): AnyASTNode | undefined {
  // If using local un-scoped identifier, it will not be found in the definitions map
  // In this case we try by building up the namespace prefix until we find a match
  let referencedNode = undefined;
  const namespacePrefixes = fromScopedIdentifier(scopedIdentifierOfUsageNode).slice(0, -1); // do not add node name
  const currPrefix: string[] = [];
  do {
    referencedNode = definitionMap.get(toScopedIdentifier([...currPrefix, usedIdentifier]));
    currPrefix.push(namespacePrefixes.shift()!);
  } while (referencedNode == undefined && namespacePrefixes.length > 0);

  return referencedNode;
}

/**
 * Iterates through IDL tree and calls `processNode` function on each node.
 * NOTE: Does not process enum members
 */
function traverseIdl(path: AnyASTNode[], processNode: (path: AnyASTNode[]) => void) {
  const currNode = path[path.length - 1]!;
  if ("definitions" in currNode) {
    currNode.definitions.forEach((n) => traverseIdl([...path, n], processNode));
  }
  processNode(path);
}

function toScopedIdentifier(path: string[]): string {
  return path.join("::");
}

function fromScopedIdentifier(path: string): string[] {
  return path.split("::");
}

/** Used for error messages. Returns "global scope" when there is no parent scoped identifier */
function getParentScopedIdentifier(scopedIdentifier: string): string {
  const path = fromScopedIdentifier(scopedIdentifier);
  if (path.length === 1) {
    return "global scope";
  }
  return toScopedIdentifier(path.slice(0, -1));
}

function normalizeType(type: string): string {
  const toType = numericTypeMap[type];
  if (toType != undefined) {
    return toType;
  }
  return type;
}
