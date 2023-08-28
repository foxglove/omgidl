import { MessageDefinition, MessageDefinitionField } from "@foxglove/message-definition";

import { AnyAnnotation } from "./astTypes";

export type IDLMessageDefinition = IDLStructDefinition | IDLModuleDefinition;

export type IDLModuleDefinition = IDLAggregatedDefinition & {
  aggregatedKind: "module";
  definitions: IDLMessageDefinitionField[];
};

export type IDLAggregatedDefinition = Omit<MessageDefinition, "definitions"> & {
  annotations?: Record<string, AnyAnnotation>;
  aggregatedKind: "struct" | "union" | "module";
};

export type IDLStructDefinition = IDLAggregatedDefinition & {
  aggregatedKind: "struct";
  annotations?: Record<string, AnyAnnotation>;
  definitions: IDLMessageDefinitionField[];
};

export type Case = {
  predicates: (number | boolean)[];
  type: IDLMessageDefinitionField;
};

export type IDLUnionDefinition = IDLAggregatedDefinition & {
  aggregatedKind: "union";
  annotations?: Record<string, AnyAnnotation>;
  switchType: string;
  cases: Case[];
  default?: IDLMessageDefinitionField;
};

export type IDLMessageDefinitionField = Omit<MessageDefinitionField, "arrayLength"> & {
  annotations?: Record<string, AnyAnnotation>;
  /** Length of array(s). Outermost arrays are first */
  arrayLengths?: number[];
};
