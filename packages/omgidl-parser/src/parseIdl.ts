import {
  ConstantValue,
  MessageDefinition,
  MessageDefinitionField,
} from "@foxglove/message-definition";
import {
  RawIdlDefinition,
  AnyIDLNode,
  parseIdlToNestedDefinitions,
  StructMemberNode,
} from "@foxglove/omgidl-grammar";

const SIMPLE_TYPES = new Set([
  "bool",
  "char",
  "byte",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "string",
]);

/**
 *
 * @param messageDefinition - idl decoded message definition string
 * @returns - parsed message definition
 */
export function parseIdl(messageDefinition: string): MessageDefinition[] {
  return buildIdlType(messageDefinition);
}

function buildIdlType(messageDefinition: string): MessageDefinition[] {
  const results = parseIdlToNestedDefinitions(messageDefinition);

  const result = results[0]!;
  const processedResult = processIdlDefinitions(result);
  for (const { definitions } of processedResult) {
    for (const definition of definitions) {
      definition.type = normalizeType(definition.type);
    }
  }

  return processedResult;
}

/** Resolves enum, constant and typedef usage in schema to make each member in the schema not referential beyond complex types.
 * Flattens down into a single array
 */
function processIdlDefinitions(definitions: RawIdlDefinition[]): MessageDefinition[] {
  const idlTree = new IDLTree(definitions);

  idlTree.resolveEnumTypes();
  idlTree.resolveConstants();
  idlTree.resolveTypeDefs();
  idlTree.resolveComplexTypes();

  return idlTree.toMessageDefinitions();
}

class IDLTree {
  definitions: RawIdlDefinition[];
  map: Map<string, AnyIDLNode>;
  constructor(definitions: RawIdlDefinition[]) {
    this.definitions = definitions;
    this.map = new Map();
    this.buildMap();
  }
  buildMap() {
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
            type: "uint32", // enums treated as unsigned longs in OMG IDL spec
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
  resolveEnumTypes() {
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
          `Could not find type <${type}> for field <${node.name ?? "undefined"}> in <${node.name}>`,
        );
      }
      if (typeNode.declarator === "enum") {
        node.type = "uint32";
        node.isComplex = false;
      }
    }
  }

  resolveConstants() {
    for (const [scopedIdentifier, node] of this.map.entries()) {
      if (
        node.declarator !== "struct-member" &&
        node.declarator !== "typedef" &&
        node.declarator !== "const"
      ) {
        continue;
      }
      // need to iterate through keys because this can occur on arrayLength, upperBound, arrayUpperBound, value, defaultValue
      for (const [key, constantName] of node.constantUsage ?? []) {
        const constantNode = resolveScopedOrLocalNodeReference({
          usedIdentifier: constantName,
          scopedIdentifierOfUsageNode: scopedIdentifier,
          definitionMap: this.map,
        });
        if (constantNode != undefined && constantNode.declarator === "const") {
          (node[key] as ConstantValue) = constantNode.value;
        } else {
          throw new Error(
            `Could not find constant <${constantName}> for field <${
              node.name ?? "undefined"
            }> in <${scopedIdentifier}>`,
          );
        }
      }
    }
  }
  /**  Resolve  what typedefs are complex */
  resolveTypeDefs() {
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
        throw new Error(
          `We do not support typedefs that reference other typedefs ${node.name} -> ${typeNode.name}`,
        );
      }
      if (typeNode.declarator === "struct") {
        node.isComplex = true;
        continue;
      }
    }
  }

  resolveComplexTypes() {
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
        const { declarator: _d, name: _name, ...partialDef } = typeNode;
        Object.assign(node, { ...partialDef });
      } else if (typeNode.declarator === "struct") {
        node.isComplex = true;
      } else {
        throw new Error(
          `Unexpected type <${typeNode.declarator}> for  <${node.name}>. Must be typedef or struct`,
        );
      }
    }
  }

  toMessageDefinitions() {
    const messageDefinitions: MessageDefinition[] = [];

    // flatten for output to message definition
    for (const [namespacedName, node] of this.map.entries()) {
      if (node.declarator === "struct") {
        messageDefinitions.push({
          name: namespacedName,
          definitions: node.definitions
            .map((d) =>
              idlNodeToMessageDefinitionField(
                this.map.get(toScopedIdentifier([namespacedName, d.name])) as StructMemberNode,
              ),
            )
            .filter(Boolean) as MessageDefinitionField[],
        });
      } else if (node.declarator === "module") {
        const fieldDefinitions = node.definitions
          .map((d) =>
            idlNodeToMessageDefinitionField(
              this.map.get(toScopedIdentifier([namespacedName, d.name])) as StructMemberNode,
            ),
          )
          .filter(Boolean) as MessageDefinitionField[];
        if (fieldDefinitions.length > 0) {
          messageDefinitions.push({
            name: namespacedName,
            definitions: fieldDefinitions,
          });
        }
      } else if (node.declarator === "enum") {
        const fieldDefinitions = node.enumerators
          .map((e) =>
            idlNodeToMessageDefinitionField(
              this.map.get(toScopedIdentifier([namespacedName, e])) as StructMemberNode,
            ),
          )
          .filter(Boolean) as MessageDefinitionField[];
        if (fieldDefinitions.length > 0) {
          messageDefinitions.push({
            name: namespacedName,
            definitions: fieldDefinitions,
          });
        }
      } else if (node.name === namespacedName) {
        const fieldDefinition = idlNodeToMessageDefinitionField(node);
        if (fieldDefinition) {
          messageDefinitions.push({ name: "", definitions: [fieldDefinition] });
        }
      }
    }
    return messageDefinitions;
  }
}

function idlNodeToMessageDefinitionField(node: AnyIDLNode): MessageDefinitionField | undefined {
  if (node.declarator !== "struct-member" && node.declarator !== "const") {
    return undefined;
  }
  const { declarator: _d, constantUsage: _cU, ...messageDefinition } = node;
  return messageDefinition;
}

function resolveScopedOrLocalNodeReference({
  usedIdentifier,
  scopedIdentifierOfUsageNode,
  definitionMap,
}: {
  usedIdentifier: string;
  scopedIdentifierOfUsageNode: string;
  definitionMap: Map<string, AnyIDLNode>;
}): AnyIDLNode | undefined {
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
function traverseIdl(path: AnyIDLNode[], processNode: (path: AnyIDLNode[]) => void) {
  const currNode = path[path.length - 1]!;
  if ("definitions" in currNode) {
    currNode.definitions.forEach((n) => traverseIdl([...path, n], processNode));
  }
  processNode(path);
}

function toScopedIdentifier(path: string[]): string {
  return path.map((id) => id).join("::");
}

function fromScopedIdentifier(path: string): string[] {
  return path.split("::");
}

export function normalizeType(type: string): string {
  // Normalize deprecated aliases
  if (type === "char") {
    return "uint8";
  } else if (type === "byte") {
    return "int8";
  }
  return type;
}
