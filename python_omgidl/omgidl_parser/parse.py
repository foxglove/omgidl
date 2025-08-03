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

constant: "const" TYPE NAME "=" const_value semicolon
const_value: SIGNED_INT
           | STRING
           | NAME

field: TYPE NAME array? semicolon

TYPE: /(unsigned\s+(short|long(\s+long)?)|long\s+double|double|float|short|long\s+long|long|int8|uint8|int16|uint16|int32|uint32|int64|uint64|byte|octet|wchar|char|string|wstring|boolean)/
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
    def start(self, items):
        return list(items)

    def definition(self, items):
        return items[0]
    def NAME(self, token):
        return str(token)

    def TYPE(self, token):
        # normalize type names
        t = str(token)
        return {
            "long double": "float64",
            "double": "float64",
            "float": "float32",
            "short": "int16",
            "unsigned short": "uint16",
            "unsigned long long": "uint64",
            "unsigned long": "uint32",
            "long long": "int64",
            "long": "int32",
        }.get(t, t)

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
        return Field(name=name, type=type_, array_length=array_length)

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


def parse_idl(source: str) -> List[Struct | Module | Constant | Enum]:
    parser = Lark(IDL_GRAMMAR, start="start")
    tree = parser.parse(source)
    return _Transformer().transform(tree)

