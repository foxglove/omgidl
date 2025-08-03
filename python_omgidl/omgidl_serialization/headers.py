import struct
from typing import Tuple


def read_delimiter_header(view: memoryview, offset: int, fmt_prefix: str) -> Tuple[int, int]:
    """Read a CDR2 delimiter header returning length and new offset."""
    length = struct.unpack_from(fmt_prefix + "I", view, offset)[0]
    return length, offset + 4


def write_delimiter_header(buffer: bytearray, offset: int, length: int, fmt_prefix: str) -> int:
    struct.pack_into(fmt_prefix + "I", buffer, offset, length)
    return offset + 4


def read_member_header(view: memoryview, offset: int, fmt_prefix: str) -> Tuple[int, int, int]:
    """Return (field_id, size, new_offset)."""
    field_id, size = struct.unpack_from(fmt_prefix + "HH", view, offset)
    return field_id, size, offset + 4


def write_member_header(buffer: bytearray, offset: int, field_id: int, size: int, fmt_prefix: str) -> int:
    struct.pack_into(fmt_prefix + "HH", buffer, offset, field_id, size)
    return offset + 4


def write_sentinel_header(buffer: bytearray, offset: int, fmt_prefix: str) -> int:
    struct.pack_into(fmt_prefix + "I", buffer, offset, 0)
    return offset + 4
