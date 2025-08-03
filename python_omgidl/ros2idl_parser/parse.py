from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Union, Any

from omgidl_parser.parse import (
    parse_idl,
    Field as IDLField,
    Struct as IDLStruct,
    Module as IDLModule,
    Constant as IDLConstant,
    Enum as IDLEnum,
)


@dataclass
class MessageDefinitionField:
    type: str
    name: str
    isComplex: bool = False
    enumType: Optional[str] = None
    isArray: bool = False
    arrayLength: Optional[int] = None
    isConstant: bool = False
    value: Optional[Union[str, int]] = None
    valueText: Optional[str] = None
    upperBound: Optional[int] = None
    arrayUpperBound: Optional[int] = None
    defaultValue: Optional[Any] = None


@dataclass
class MessageDefinition:
    name: Optional[str]
    definitions: List[MessageDefinitionField] = field(default_factory=list)


ROS2IDL_HEADER = re.compile(r"={80}\nIDL: [a-zA-Z][\w]*(?:\/[a-zA-Z][\w]*)*")


def parse_ros2idl(message_definition: str) -> List[MessageDefinition]:
    """Parse ros2idl schema into message definitions."""
    idl_conformed = ROS2IDL_HEADER.sub("", message_definition)
    parsed = parse_idl(idl_conformed)
    message_defs: List[MessageDefinition] = []
    for definition in parsed:
        message_defs.extend(_process_definition(definition, []))

    for msg in message_defs:
        if msg.name is not None:
            msg.name = _normalize_name(msg.name)
        for field in msg.definitions:
            field.type = _normalize_name(field.type)

        if msg.name in ("builtin_interfaces/msg/Time", "builtin_interfaces/msg/Duration"):
            for field in msg.definitions:
                if field.name == "nanosec":
                    field.name = "nsec"

    return message_defs


def _process_definition(defn: IDLStruct | IDLModule | IDLConstant | IDLEnum, scope: List[str]) -> List[MessageDefinition]:
    results: List[MessageDefinition] = []
    if isinstance(defn, IDLStruct):
        fields = [_convert_field(f) for f in defn.fields]
        results.append(MessageDefinition(name="/".join([*scope, defn.name]), definitions=fields))
    elif isinstance(defn, IDLModule):
        const_fields = [_convert_constant(c) for c in defn.definitions if isinstance(c, IDLConstant)]
        if const_fields:
            results.append(
                MessageDefinition(name="/".join([*scope, defn.name]), definitions=const_fields)
            )
        for sub in defn.definitions:
            if isinstance(sub, (IDLModule, IDLStruct)):
                results.extend(_process_definition(sub, [*scope, defn.name]))
    elif isinstance(defn, IDLConstant):
        results.append(
            MessageDefinition(name="/".join(scope), definitions=[_convert_constant(defn)])
        )
    return results


def _convert_field(field: IDLField) -> MessageDefinitionField:
    return MessageDefinitionField(
        type=field.type,
        name=field.name,
        isArray=field.array_length is not None,
        arrayLength=field.array_length,
    )


def _convert_constant(const: IDLConstant) -> MessageDefinitionField:
    return MessageDefinitionField(
        type=const.type,
        name=const.name,
        isConstant=True,
        value=const.value,
        valueText=str(const.value),
    )


def _normalize_name(name: str) -> str:
    return name.replace("::", "/") if "::" in name else name
