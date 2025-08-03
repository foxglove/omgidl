from __future__ import annotations

import struct
from array import array
from enum import IntEnum
from typing import List, Dict, Any, Optional

from omgidl_parser.parse import Struct, Field, Module, Union as IDLUnion

from .constants import UNION_DISCRIMINATOR_PROPERTY_KEY


PRIMITIVE_SIZES: Dict[str, int] = {
    "bool": 1,
    "int8": 1,
    "uint8": 1,
    "int16": 2,
    "uint16": 2,
    "int32": 4,
    "uint32": 4,
    "int64": 8,
    "uint64": 8,
    "float32": 4,
    "float64": 8,
}

PRIMITIVE_FORMATS: Dict[str, str] = {
    "bool": "b",
    "int8": "b",
    "uint8": "B",
    "int16": "h",
    "uint16": "H",
    "int32": "i",
    "uint32": "I",
    "int64": "q",
    "uint64": "Q",
    "float32": "f",
    "float64": "d",
}

_SEQUENCE_TYPES = (list, tuple, array, memoryview)


class EncapsulationKind(IntEnum):
    """Encapsulation header representation identifiers."""

    CDR_BE = 0x00
    CDR_LE = 0x01
    PL_CDR_BE = 0x02
    PL_CDR_LE = 0x03
    CDR2_BE = 0x10
    CDR2_LE = 0x11
    PL_CDR2_BE = 0x12
    PL_CDR2_LE = 0x13
    DELIMITED_CDR2_BE = 0x14
    DELIMITED_CDR2_LE = 0x15
    RTPS_CDR2_BE = 0x06
    RTPS_CDR2_LE = 0x07
    RTPS_DELIMITED_CDR2_BE = 0x08
    RTPS_DELIMITED_CDR2_LE = 0x09
    RTPS_PL_CDR2_BE = 0x0A
    RTPS_PL_CDR2_LE = 0x0B


_LITTLE_ENDIAN_KINDS = {
    EncapsulationKind.CDR_LE,
    EncapsulationKind.PL_CDR_LE,
    EncapsulationKind.CDR2_LE,
    EncapsulationKind.PL_CDR2_LE,
    EncapsulationKind.DELIMITED_CDR2_LE,
    EncapsulationKind.RTPS_CDR2_LE,
    EncapsulationKind.RTPS_DELIMITED_CDR2_LE,
    EncapsulationKind.RTPS_PL_CDR2_LE,
}


def _encapsulation_header(kind: EncapsulationKind) -> bytes:
    """Return the 4-byte encapsulation header for ``kind``."""
    return bytes((0, int(kind), 0, 0))


class MessageWriter:
    """Serialize Python dictionaries to CDR-encoded bytes.

    This is a minimal Python port of the TypeScript MessageWriter. It supports
    primitive fields, fixed-length arrays, and variable-length sequences as
    produced by the simplified ``parse_idl`` parser.

    ``encapsulation_kind`` selects the representation identifier written to the
    start of each message. ``EncapsulationKind.CDR_LE`` is used by default.
    """

    def __init__(
        self,
        root_definition_name: str,
        definitions: List[Struct | Module | IDLUnion],
        encapsulation_kind: EncapsulationKind = EncapsulationKind.CDR_LE,
    ) -> None:
        root = _find_struct(definitions, root_definition_name)
        if root is None:
            raise ValueError(
                f'Root definition name "{root_definition_name}" not found in schema definitions.'
            )
        self.root = root
        self.definitions = definitions
        self.encapsulation_kind = encapsulation_kind
        self._little_endian = encapsulation_kind in _LITTLE_ENDIAN_KINDS
        self._fmt_prefix = "<" if self._little_endian else ">"

    # public API -------------------------------------------------------------
    def calculate_byte_size(self, message: Dict[str, Any]) -> int:
        return self._byte_size(self.root.fields, message, 4)

    def write_message(self, message: Dict[str, Any]) -> bytes:
        size = self.calculate_byte_size(message)
        buffer = bytearray(size)
        buffer[0:4] = _encapsulation_header(self.encapsulation_kind)
        self._write(self.root.fields, message, buffer, 4)
        return bytes(buffer)

    # internal helpers ------------------------------------------------------
    def _byte_size(self, definition: List[Field], message: Dict[str, Any], offset: int) -> int:
        msg = message or {}
        new_offset = offset
        for field in definition:
            value = msg.get(field.name)
            if value is None and field.annotations.get("default") is not None:
                value = field.annotations["default"]
            new_offset = self._field_size(field, value, new_offset)
        return new_offset

    def _field_size(self, field: Field, value: Any, offset: int) -> int:
        t = field.type
        if field.array_lengths:
            return self._byte_size_array(field, value, field.array_lengths, offset)
        # Single field or dynamic sequence
        if field.is_sequence or isinstance(value, _SEQUENCE_TYPES):
            # Variable-length sequence
            arr = value if isinstance(value, _SEQUENCE_TYPES) else []
            if t in PRIMITIVE_SIZES and isinstance(arr, memoryview):
                length = arr.nbytes // _primitive_size(t)
            else:
                length = len(arr)
            if field.sequence_bound is not None and length > field.sequence_bound:
                raise ValueError(
                    f"Field '{field.name}' sequence length {length} exceeds bound {field.sequence_bound}"
                )
            offset += _padding(offset, 4)
            offset += 4
            if t in ("string", "wstring"):
                for s in arr:
                    s = s if isinstance(s, str) else ""
                    if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                        raise ValueError(
                            f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                        )
                    offset += _padding(offset, 4)
                    encoded = s.encode("utf-8" if t == "string" else "utf-16-le")
                    offset += 4 + len(encoded) + (1 if t == "string" else 2)
            elif t in PRIMITIVE_SIZES:
                size = _primitive_size(t)
                offset += _padding(offset, size)
                offset += size * length
            else:
                struct_def = _find_struct(self.definitions, t)
                if struct_def is not None:
                    for msg in arr:
                        msg_dict = msg if isinstance(msg, dict) else {}
                        offset = self._byte_size(struct_def.fields, msg_dict, offset)
                else:
                    union_def = _find_union(self.definitions, t)
                    if union_def is None:
                        raise ValueError(f"Unrecognized struct or union type {t}")
                    for msg in arr:
                        msg_dict = msg if isinstance(msg, dict) else {}
                        offset = self._byte_size_union(union_def, msg_dict, offset)
        else:
            if t in ("string", "wstring"):
                s = value if isinstance(value, str) else ""
                if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                    raise ValueError(
                        f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                    )
                offset += _padding(offset, 4)
                encoded = s.encode("utf-8" if t == "string" else "utf-16-le")
                offset += 4 + len(encoded) + (1 if t == "string" else 2)
            elif t in PRIMITIVE_SIZES:
                size = _primitive_size(t)
                offset += _padding(offset, size)
                offset += size
            else:
                struct_def = _find_struct(self.definitions, t)
                if struct_def is not None:
                    msg_dict = value if isinstance(value, dict) else {}
                    offset = self._byte_size(struct_def.fields, msg_dict, offset)
                else:
                    union_def = _find_union(self.definitions, t)
                    if union_def is None:
                        raise ValueError(f"Unrecognized struct or union type {t}")
                    msg_dict = value if isinstance(value, dict) else {}
                    offset = self._byte_size_union(union_def, msg_dict, offset)
        return offset

    def _byte_size_array(
        self, field: Field, value: Any, lengths: List[int], offset: int
    ) -> int:
        t = field.type
        arr = value if isinstance(value, _SEQUENCE_TYPES) else []
        length = lengths[0]
        arr_len = (
            arr.nbytes // _primitive_size(t) if isinstance(arr, memoryview) and t in PRIMITIVE_SIZES else len(arr)
        )
        if len(lengths) > 1:
            for i in range(length):
                sub = arr[i] if i < arr_len else []
                offset = self._byte_size_array(field, sub, lengths[1:], offset)
            return offset
        if t in ("string", "wstring"):
            for i in range(length):
                s = arr[i] if i < arr_len and isinstance(arr[i], str) else ""
                if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                    raise ValueError(
                        f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                    )
                offset += _padding(offset, 4)
                encoded = s.encode("utf-8" if t == "string" else "utf-16-le")
                offset += 4 + len(encoded) + (1 if t == "string" else 2)
        elif t in PRIMITIVE_SIZES:
            size = _primitive_size(t)
            offset += _padding(offset, size)
            offset += size * length
        else:
            struct_def = _find_struct(self.definitions, t)
            if struct_def is not None:
                for i in range(length):
                    msg = arr[i] if i < arr_len and isinstance(arr[i], dict) else {}
                    offset = self._byte_size(struct_def.fields, msg, offset)
            else:
                union_def = _find_union(self.definitions, t)
                if union_def is None:
                    raise ValueError(f"Unrecognized struct or union type {t}")
                for i in range(length):
                    msg = arr[i] if i < arr_len and isinstance(arr[i], dict) else {}
                    offset = self._byte_size_union(union_def, msg, offset)
        return offset

    def _write(self, definition: List[Field], message: Dict[str, Any], buffer: bytearray, offset: int) -> int:
        msg = message or {}
        new_offset = offset
        for field in definition:
            value = msg.get(field.name)
            if value is None and field.annotations.get("default") is not None:
                value = field.annotations["default"]
            new_offset = self._write_field(field, value, buffer, new_offset)
        return new_offset

    def _write_field(self, field: Field, value: Any, buffer: bytearray, offset: int) -> int:
        t = field.type
        if field.array_lengths:
            return self._write_array(field, value, buffer, offset, field.array_lengths)
        else:
            if field.is_sequence or isinstance(value, _SEQUENCE_TYPES):
                # Variable-length sequence
                arr = value if isinstance(value, _SEQUENCE_TYPES) else []
                if t in PRIMITIVE_SIZES and isinstance(arr, memoryview):
                    length = arr.nbytes // _primitive_size(t)
                else:
                    length = len(arr)
                if field.sequence_bound is not None and length > field.sequence_bound:
                    raise ValueError(
                        f"Field '{field.name}' sequence length {length} exceeds bound {field.sequence_bound}"
                    )
                offset += _padding(offset, 4)
                struct.pack_into(self._fmt_prefix + "I", buffer, offset, length)
                offset += 4
                if t in ("string", "wstring"):
                    for s in arr:
                        s = s if isinstance(s, str) else ""
                        if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                            raise ValueError(
                                f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                            )
                        offset += _padding(offset, 4)
                        encoded = s.encode("utf-8" if t == "string" else "utf-16-le")
                        length_s = len(encoded) + (1 if t == "string" else 2)
                        struct.pack_into(self._fmt_prefix + "I", buffer, offset, length_s)
                        offset += 4
                        buffer[offset:offset + len(encoded)] = encoded
                        offset += len(encoded)
                        buffer[offset:offset + (1 if t == "string" else 2)] = b"\x00" * (1 if t == "string" else 2)
                        offset += 1 if t == "string" else 2
                elif t in PRIMITIVE_SIZES:
                    size = _primitive_size(t)
                    fmt = self._fmt_prefix + PRIMITIVE_FORMATS[t]
                    offset += _padding(offset, size)
                    for v in arr:
                        v = v if v is not None else 0
                        struct.pack_into(fmt, buffer, offset, v)
                        offset += size
                else:
                    struct_def = _find_struct(self.definitions, t)
                    if struct_def is not None:
                        for msg in arr:
                            msg_dict = msg if isinstance(msg, dict) else {}
                            offset = self._write(struct_def.fields, msg_dict, buffer, offset)
                    else:
                        union_def = _find_union(self.definitions, t)
                        if union_def is None:
                            raise ValueError(f"Unrecognized struct or union type {t}")
                        for msg in arr:
                            msg_dict = msg if isinstance(msg, dict) else {}
                            offset = self._write_union(union_def, msg_dict, buffer, offset)
            else:
                if t in ("string", "wstring"):
                    s = value if isinstance(value, str) else ""
                    if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                        raise ValueError(
                            f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                        )
                    offset += _padding(offset, 4)
                    encoded = s.encode("utf-8" if t == "string" else "utf-16-le")
                    length = len(encoded) + (1 if t == "string" else 2)
                    struct.pack_into(self._fmt_prefix + "I", buffer, offset, length)
                    offset += 4
                    buffer[offset:offset + len(encoded)] = encoded
                    offset += len(encoded)
                    buffer[offset:offset + (1 if t == "string" else 2)] = b"\x00" * (1 if t == "string" else 2)
                    offset += 1 if t == "string" else 2
                elif t in PRIMITIVE_SIZES:
                    size = _primitive_size(t)
                    fmt = self._fmt_prefix + PRIMITIVE_FORMATS[t]
                    offset += _padding(offset, size)
                    v = value if value is not None else 0
                    struct.pack_into(fmt, buffer, offset, v)
                    offset += size
                else:
                    struct_def = _find_struct(self.definitions, t)
                    if struct_def is not None:
                        msg_dict = value if isinstance(value, dict) else {}
                        offset = self._write(struct_def.fields, msg_dict, buffer, offset)
                    else:
                        union_def = _find_union(self.definitions, t)
                        if union_def is None:
                            raise ValueError(f"Unrecognized struct or union type {t}")
                        msg_dict = value if isinstance(value, dict) else {}
                        offset = self._write_union(union_def, msg_dict, buffer, offset)
        return offset

    def _write_array(
        self, field: Field, value: Any, buffer: bytearray, offset: int, lengths: List[int]
    ) -> int:
        t = field.type
        arr = value if isinstance(value, _SEQUENCE_TYPES) else []
        length = lengths[0]
        arr_len = (
            arr.nbytes // _primitive_size(t) if isinstance(arr, memoryview) and t in PRIMITIVE_SIZES else len(arr)
        )
        if len(lengths) > 1:
            for i in range(length):
                sub = arr[i] if i < arr_len else []
                offset = self._write_array(field, sub, buffer, offset, lengths[1:])
            return offset
        if t in ("string", "wstring"):
            for i in range(length):
                s = arr[i] if i < arr_len and isinstance(arr[i], str) else ""
                if field.string_upper_bound is not None and len(s) > field.string_upper_bound:
                    raise ValueError(
                        f"Field '{field.name}' string length {len(s)} exceeds bound {field.string_upper_bound}"
                    )
                offset += _padding(offset, 4)
                encoded = s.encode("utf-8" if t == "string" else "utf-16-le")
                length_bytes = len(encoded) + (1 if t == "string" else 2)
                struct.pack_into(self._fmt_prefix + "I", buffer, offset, length_bytes)
                offset += 4
                buffer[offset:offset + len(encoded)] = encoded
                offset += len(encoded)
                buffer[offset:offset + (1 if t == "string" else 2)] = b"\x00" * (
                    1 if t == "string" else 2
                )
                offset += 1 if t == "string" else 2
        elif t in PRIMITIVE_SIZES:
            size = _primitive_size(t)
            fmt = self._fmt_prefix + PRIMITIVE_FORMATS[t]
            offset += _padding(offset, size)
            for i in range(length):
                v = arr[i] if i < arr_len else 0
                struct.pack_into(fmt, buffer, offset, v)
                offset += size
        else:
            struct_def = _find_struct(self.definitions, t)
            if struct_def is not None:
                for i in range(length):
                    msg = arr[i] if i < arr_len and isinstance(arr[i], dict) else {}
                    offset = self._write(struct_def.fields, msg, buffer, offset)
            else:
                union_def = _find_union(self.definitions, t)
                if union_def is None:
                    raise ValueError(f"Unrecognized struct or union type {t}")
                for i in range(length):
                    msg = arr[i] if i < arr_len and isinstance(arr[i], dict) else {}
                    offset = self._write_union(union_def, msg, buffer, offset)
        return offset

    def _byte_size_union(self, union_def: IDLUnion, message: Dict[str, Any], offset: int) -> int:
        disc_field = Field(name=UNION_DISCRIMINATOR_PROPERTY_KEY, type=union_def.switch_type)
        disc = message.get(UNION_DISCRIMINATOR_PROPERTY_KEY)
        offset = self._field_size(disc_field, disc, offset)
        case_field = _union_case_field(union_def, disc)
        if case_field is None:
            raise ValueError(
                f"No matching case for union {union_def.name} discriminator {disc}"
            )
        value = message.get(case_field.name)
        offset = self._field_size(case_field, value, offset)
        return offset

    def _write_union(
        self, union_def: IDLUnion, message: Dict[str, Any], buffer: bytearray, offset: int
    ) -> int:
        disc_field = Field(name=UNION_DISCRIMINATOR_PROPERTY_KEY, type=union_def.switch_type)
        disc = message.get(UNION_DISCRIMINATOR_PROPERTY_KEY)
        if disc is None:
            raise ValueError(
                f"Union {union_def.name} requires '{UNION_DISCRIMINATOR_PROPERTY_KEY}' discriminator"
            )
        offset = self._write_field(disc_field, disc, buffer, offset)
        case_field = _union_case_field(union_def, disc)
        if case_field is None:
            raise ValueError(
                f"No matching case for union {union_def.name} discriminator {disc}"
            )
        value = message.get(case_field.name)
        offset = self._write_field(case_field, value, buffer, offset)
        return offset


def _padding(offset: int, byte_width: int) -> int:
    alignment = (offset - 4) % byte_width
    return 0 if alignment == 0 else byte_width - alignment


def _primitive_size(t: str) -> int:
    size = PRIMITIVE_SIZES.get(t)
    if size is None:
        raise ValueError(f"Unrecognized primitive type {t}")
    return size


def _find_struct(defs: List[Struct | Module], name: str) -> Optional[Struct]:
    for d in defs:
        if isinstance(d, Struct) and d.name == name:
            return d
        if isinstance(d, Module):
            found = _find_struct(d.definitions, name)
            if found is not None:
                return found
    return None


def _find_union(defs: List[Struct | Module | IDLUnion], name: str) -> Optional[IDLUnion]:
    for d in defs:
        if isinstance(d, IDLUnion) and d.name == name:
            return d
        if isinstance(d, Module):
            found = _find_union(d.definitions, name)  # type: ignore[arg-type]
            if found is not None:
                return found
    return None


def _union_case_field(union_def: IDLUnion, discriminator: Any) -> Optional[Field]:
    """Return the field matching ``discriminator`` for ``union_def``.

    The ``UnionCase`` objects produced by the parser changed from exposing a
    ``value`` attribute to a ``predicates`` list. Support both styles so that
    union handling works with either representation.
    """

    for case in union_def.cases:
        # Newer parser versions provide ``predicates`` with possible values.
        predicates = getattr(case, "predicates", None)
        if predicates is not None:
            if discriminator in predicates:
                return case.field

        # Older parser versions exposed a single ``value`` attribute.
        value = getattr(case, "value", None)
        if value == discriminator:
            return case.field

    if union_def.default is not None:
        return union_def.default
    return None
