from __future__ import annotations

import struct
from enum import IntEnum
from typing import List, Dict, Any, Optional

from omgidl_parser.parse import Struct, Field, Module


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
        definitions: List[Struct | Module],
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
            new_offset = self._field_size(field, value, new_offset)
        return new_offset

    def _field_size(self, field: Field, value: Any, offset: int) -> int:
        t = field.type
        if field.array_length is not None:
            # Fixed-length array
            if t in ("string", "wstring"):
                arr = value if isinstance(value, (list, tuple)) else []
                for i in range(field.array_length):
                    s = arr[i] if i < len(arr) and isinstance(arr[i], str) else ""
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
                offset += size * field.array_length
            else:
                struct_def = _find_struct(self.definitions, t)
                if struct_def is None:
                    raise ValueError(f"Unrecognized struct type {t}")
                arr = value if isinstance(value, (list, tuple)) else []
                for i in range(field.array_length):
                    msg = arr[i] if i < len(arr) and isinstance(arr[i], dict) else {}
                    offset = self._byte_size(struct_def.fields, msg, offset)
        else:
            # Single field or dynamic sequence
            if field.is_sequence or isinstance(value, (list, tuple)):
                # Variable-length sequence
                arr = value if isinstance(value, (list, tuple)) else []
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
                    if struct_def is None:
                        raise ValueError(f"Unrecognized struct type {t}")
                    for msg in arr:
                        msg_dict = msg if isinstance(msg, dict) else {}
                        offset = self._byte_size(struct_def.fields, msg_dict, offset)
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
                    if struct_def is None:
                        raise ValueError(f"Unrecognized struct type {t}")
                    msg_dict = value if isinstance(value, dict) else {}
                    offset = self._byte_size(struct_def.fields, msg_dict, offset)
        return offset

    def _write(self, definition: List[Field], message: Dict[str, Any], buffer: bytearray, offset: int) -> int:
        msg = message or {}
        new_offset = offset
        for field in definition:
            value = msg.get(field.name)
            new_offset = self._write_field(field, value, buffer, new_offset)
        return new_offset

    def _write_field(self, field: Field, value: Any, buffer: bytearray, offset: int) -> int:
        t = field.type
        if field.array_length is not None:
            # Fixed-length array
            if t in ("string", "wstring"):
                arr = value if isinstance(value, (list, tuple)) else []
                for i in range(field.array_length):
                    s = arr[i] if i < len(arr) and isinstance(arr[i], str) else ""
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
                arr = value if isinstance(value, (list, tuple)) else []
                offset += _padding(offset, size)
                for i in range(field.array_length):
                    v = arr[i] if i < len(arr) else 0
                    struct.pack_into(fmt, buffer, offset, v)
                    offset += size
            else:
                struct_def = _find_struct(self.definitions, t)
                if struct_def is None:
                    raise ValueError(f"Unrecognized struct type {t}")
                arr = value if isinstance(value, (list, tuple)) else []
                for i in range(field.array_length):
                    msg = arr[i] if i < len(arr) and isinstance(arr[i], dict) else {}
                    offset = self._write(struct_def.fields, msg, buffer, offset)
        else:
            if field.is_sequence or isinstance(value, (list, tuple)):
                # Variable-length sequence
                arr = value if isinstance(value, (list, tuple)) else []
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
                    if struct_def is None:
                        raise ValueError(f"Unrecognized struct type {t}")
                    for msg in arr:
                        msg_dict = msg if isinstance(msg, dict) else {}
                        offset = self._write(struct_def.fields, msg_dict, buffer, offset)
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
                    if struct_def is None:
                        raise ValueError(f"Unrecognized struct type {t}")
                    msg_dict = value if isinstance(value, dict) else {}
                    offset = self._write(struct_def.fields, msg_dict, buffer, offset)
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
