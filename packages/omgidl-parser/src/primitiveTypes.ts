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
  char: "uint8",
  byte: "int8",
};

export const INTEGER_TYPES = new Set([
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "byte",
  "octet",
  "unsigned short",
  "unsigned long",
  "unsigned long long",
  "short",
  "long",
  "long long",
]);

export const SIMPLE_TYPES = new Set([
  "bool",
  "string",
  "wstring",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "wchar",
  ...Object.keys(numericTypeMap),
]);

export function normalizeType(type: string): string {
  const toType = numericTypeMap[type];
  if (toType != undefined) {
    return toType;
  }
  return type;
}
