import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";

import { AnyAnnotation } from "./astTypes";

/** Final resolved MessageDefinition types */

/** Higher-level resolved definitions (struct, modules)*/
export type IDLMessageDefinition = IDLStructDefinition | IDLModuleDefinition | IDLUnionDefinition;

export type IDLModuleDefinition = IDLAggregatedDefinition & {
  aggregatedKind: "module";
  /** Should only contain constants directly contained within module.
   * Does not include constants contained within submodules any other definitions contained within the module.
   */
  definitions: IDLMessageDefinitionField[];
};

/**  */
export type IDLAggregatedDefinition = Omit<MessageDefinition, "definitions"> & {
  /** Annotations from schema. Only default annotations are resolved currently */
  annotations?: Record<string, AnyAnnotation>;
  /** Denotes whether the MessageDefinition is a `struct`, `union` or `module`
   * These are important to denote for serialization. Specifically for when a struct-member
   * references a complex type (struct or union).
   */
  aggregatedKind: "struct" | "union" | "module";
};

export type IDLStructDefinition = IDLAggregatedDefinition & {
  aggregatedKind: "struct";
  definitions: IDLMessageDefinitionField[];
};

export type IDLUnionDefinition = IDLAggregatedDefinition & {
  aggregatedKind: "union";
  /** Type to read that determines what case to use. Must be numeric or boolean */
  switchType: string;
  cases: Case[];
  /** Resolved default type specification */
  default?: IDLMessageDefinitionField;
};

/** Case with resolved predicates and type definition */
export type Case = {
  /** Array of values that, if read, would cause the type to be used */
  predicates: (number | boolean)[];
  /** Type to be used if value from predicate array is read */
  type: IDLMessageDefinitionField;
};

/**
 * All primitive struct-members are resolved such that they do not contain references to typedefs or constant values.
 * The only references they hold are to complex values (structs, unions ).
 */
export type IDLMessageDefinitionField = Omit<MessageDefinitionField, "arrayLength"> & {
  /** Annotations from schema. Only default annotations are resolved currently */
  annotations?: Record<string, AnyAnnotation>;
  /** Length of array(s). Outermost arrays are first */
  arrayLengths?: number[];
};
