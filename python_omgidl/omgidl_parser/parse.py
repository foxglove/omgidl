from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Union

from lark import Lark, Transformer

# A slightly larger subset grammar supporting modules, structs, constants and enums
IDL_GRAMMAR = r"""
start: definition+

definition: module
          | struct
          | constant
          | enum

module: "module" NAME "{" definition* "}" semicolon?

struct: "struct" NAME "{" field* "}" semicolon?

enum: "enum" NAME "{" enumerator ("," enumerator)* "}" semicolon?

enumerator: NAME enum_value?
enum_value: "@value" "(" INT ")"

constant: "const" type NAME "=" const_value semicolon
const_value: SIGNED_INT
           | STRING
           | NAME

field: type NAME array? semicolon

type: sequence_type
    | BUILTIN_TYPE
    | scoped_name

sequence_type: "sequence" "<" type ("," INT)? ">"

scoped_name: NAME ("::" NAME)*

BUILTIN_TYPE: /(unsigned\s+(short|long(\s+long)?)|long\s+double|double|float|short|long\s+long|long|int8|uint8|int16|uint16|int32|uint32|int64|uint64|byte|octet|wchar|char|string|wstring|boolean)/
NAME: /[A-Za-z_][A-Za-z0-9_]*/

array: "[" INT "]"

semicolon: ";"

%import common.INT
%import common.SIGNED_INT
%import common.ESCAPED_STRING -> STRING
%import common.WS
%ignore WS
"""

@dataclass
class Field:
    name: str
    type: str
    array_length: Optional[int] = None
    is_sequence: bool = False


@dataclass
class Constant:
    name: str
    type: str
    value: Union[int, str]


@dataclass
class Enum:
    name: str
    enumerators: List[Constant] = field(default_factory=list)

@dataclass
class Struct:
    name: str
    fields: List[Field] = field(default_factory=list)

@dataclass
class Module:
    name: str
    definitions: List[Struct | Module | Constant | Enum] = field(default_factory=list)

class _Transformer(Transformer):
    _NORMALIZATION = {
        "long double": "float64",
        "double": "float64",
        "float": "float32",
        "short": "int16",
        "unsigned short": "uint16",
        "unsigned long long": "uint64",
        "unsigned long": "uint32",
        "long long": "int64",
        "long": "int32",
    }

    _BUILTIN_TYPES = {
        "float64",
        "float32",
        "int16",
        "uint16",
        "uint64",
        "uint32",
        "int64",
        "int32",
        "int8",
        "uint8",
        "byte",
        "octet",
        "wchar",
        "char",
        "string",
        "wstring",
        "boolean",
    }

    def start(self, items):
        return list(items)

    def definition(self, items):
        return items[0]
    def NAME(self, token):
        return str(token)

    def scoped_name(self, items):
        return "::".join(items)

    def type(self, items):
        (t,) = items
        if isinstance(t, tuple) and t[0] == "sequence":
            inner = t[1]
            return ("sequence", self._NORMALIZATION.get(inner, inner))
        if isinstance(t, str):
            return self._NORMALIZATION.get(t, t)
        token = str(t)
        return self._NORMALIZATION.get(token, token)

    def sequence_type(self, items):
        inner = items[0]
        return ("sequence", inner)

    def INT(self, token):
        return int(token)

    def SIGNED_INT(self, token):
        return int(token)

    def STRING(self, token):
        return str(token)[1:-1]

    def array(self, items):
        (length,) = items
        return length

    def semicolon(self, _):
        return None

    def field(self, items):
        type_, name, *rest = items
        array_length = None
        for itm in rest:
            if isinstance(itm, int):
                array_length = itm
        is_sequence = False
        if isinstance(type_, tuple) and type_[0] == "sequence":
            is_sequence = True
            type_ = type_[1]
        return Field(name=name, type=type_, array_length=array_length, is_sequence=is_sequence)

    def const_value(self, items):
        (value,) = items
        return value

    def constant(self, items):
        # items: TYPE, NAME, value, None
        type_, name, value, _ = items
        return Constant(name=name, type=type_, value=value)

    def enum_value(self, items):
        (_, _, val, _) = items
        return val

    def enumerator(self, items):
        name = items[0]
        value = items[1] if len(items) > 1 else None
        return (name, value)

    def enum(self, items):
        name = items[0]
        enumerators_raw = [it for it in items[1:] if isinstance(it, tuple)]
        constants: List[Constant] = []
        current = -1
        for enum_name, enum_val in enumerators_raw:
            if enum_val is not None:
                current = enum_val
            else:
                current += 1
            constants.append(Constant(name=enum_name, type="uint32", value=current))
        return Enum(name=name, enumerators=constants)

    def struct(self, items):
        name = items[0]
        fields = [i for i in items[1:] if isinstance(i, Field)]
        return Struct(name=name, fields=fields)

    def module(self, items):
        name = items[0]
        definitions = [item for item in items[1:] if item is not None]
        return Module(name=name, definitions=definitions)

    def resolve_types(self, definitions: List[Struct | Module | Constant | Enum]):
        struct_names: set[str] = set()

        def collect(defs: List[Struct | Module | Constant | Enum], scope: List[str]):
            for d in defs:
                if isinstance(d, Struct):
                    full = "::".join([*scope, d.name])
                    struct_names.add(full)
                elif isinstance(d, Module):
                    collect(d.definitions, [*scope, d.name])

        collect(definitions, [])

        def resolve(defs: List[Struct | Module | Constant | Enum], scope: List[str]):
            for d in defs:
                if isinstance(d, Struct):
                    for f in d.fields:
                        if f.type in self._BUILTIN_TYPES:
                            continue
                        if f.type.startswith("::"):
                            f.type = f.type[2:]
                            continue
                        if "::" in f.type:
                            continue
                        resolved = None
                        for i in range(len(scope), -1, -1):
                            candidate = "::".join([*scope[:i], f.type])
                            if candidate in struct_names:
                                resolved = candidate
                                break
                        if resolved:
                            f.type = resolved
                elif isinstance(d, Module):
                    resolve(d.definitions, [*scope, d.name])

        resolve(definitions, [])


def parse_idl(source: str) -> List[Struct | Module | Constant | Enum]:
    parser = Lark(IDL_GRAMMAR, start="start")
    tree = parser.parse(source)
    transformer = _Transformer()
    result = transformer.transform(tree)
    transformer.resolve_types(result)
    return result

