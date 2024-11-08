import { CdrWriter, EncapsulationKind } from "@foxglove/cdr";
import { parseIDL } from "@foxglove/omgidl-parser";

import { MessageReader } from "./MessageReader";
import { UNION_DISCRIMINATOR_PROPERTY_KEY } from "./constants";

const serializeString = (str: string): Uint8Array => {
  const data = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.byteLength + 1, 0);
  return Uint8Array.from([...len, ...data, 0x00]);
};

const float32Buffer = (floats: number[]): Uint8Array => {
  return new Uint8Array(Float32Array.from(floats).buffer);
};

describe("MessageReader", () => {
  it("simple test", () => {
    const msgDef = `module a {
        struct c { int8 status; };
        module b {
          const int8 STATUS_ONE = 1;
          const int8 STATUS_TWO = 2;
        };
      };`;
    const ast = parseIDL(msgDef);
    expect(ast).not.toBeUndefined();
  });
  it.each([
    [`struct a {int8 sample; /** lowest */};`, "a", [0x80], { sample: -128 }],
    [`struct a {int8 sample; /** highest */};`, "a", [0x7f], { sample: 127 }],
    [`struct a {uint8 sample; /** lowest */};`, "a", [0x00], { sample: 0 }],
    [`struct a {uint8 sample; /** highest */};`, "a", [0xff], { sample: 255 }],
    [`struct a {int16 sample; /** lowest */};`, "a", [0x00, 0x80], { sample: -32768 }],
    [`struct a {int16 sample; /** highest */};`, "a", [0xff, 0x7f], { sample: 32767 }],
    [`struct a {uint16 sample; /** lowest */};`, "a", [0x00, 0x00], { sample: 0 }],
    [`struct a {uint16 sample; /** highest */};`, "a", [0xff, 0xff], { sample: 65535 }],
    [
      `struct a {int32 sample; /** lowest */};`,
      "a",
      [0x00, 0x00, 0x00, 0x80],
      { sample: -2147483648 },
    ],
    [
      `struct a {int32 sample; /** highest */};`,
      "a",
      [0xff, 0xff, 0xff, 0x7f],
      { sample: 2147483647 },
    ],
    [`struct a {uint32 sample; /** lowest */};`, "a", [0x00, 0x00, 0x00, 0x00], { sample: 0 }],
    [
      `struct a {uint32 sample; /** highest */};`,
      "a",
      [0xff, 0xff, 0xff, 0xff],
      { sample: 4294967295 },
    ],
    [
      `struct a {int64 sample; /** lowest */};`,
      "a",
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80],
      { sample: -9223372036854775808n },
    ],
    [
      `struct a {int64 sample; /** highest */};`,
      "a",
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f],
      { sample: 9223372036854775807n },
    ],
    [
      `struct a {uint64 sample; /** lowest */};`,
      "a",
      [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      { sample: 0n },
    ],
    [
      `struct a {uint64 sample; /** highest */};`,
      "a",
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      { sample: 18446744073709551615n },
    ],
    [`struct a {float sample; };`, "a", float32Buffer([5.5]), { sample: 5.5 }],
    [
      `struct a {double sample; };`,
      "a",
      // eslint-disable-next-line no-loss-of-precision
      new Uint8Array(Float64Array.of(0.123456789121212121212).buffer),
      // eslint-disable-next-line no-loss-of-precision
      { sample: 0.123456789121212121212 },
    ],
    [
      `struct a {sequence<int32> arr; };`,
      "a",
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...new Uint8Array(Int32Array.of(3, 7).buffer),
      ],
      { arr: Int32Array.from([3, 7]) },
    ],
    // unaligned access
    [
      `struct a {uint8 blank;sequence<int32> arr;};`,
      "a",
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...new Uint8Array(Int32Array.of(3, 7).buffer),
      ],
      { blank: 0, arr: Int32Array.from([3, 7]) },
    ],
    [
      `struct a {float arr[2];};`,
      "a",
      float32Buffer([5.5, 6.5]),
      { arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `struct a {uint8 blank; float arr[2]; };`,
      "a",
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...float32Buffer([5.5, 6.5]),
      ],
      { blank: 0, arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `struct a {sequence<float> arr;};`,
      "a",
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
      ],
      { arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `struct a {uint8 blank; sequence<float> arr;};`,
      "a",
      [
        0x00,
        ...[0x00, 0x00, 0x00], // alignment
        ...[0x02, 0x00, 0x00, 0x00],
        ...float32Buffer([5.5, 6.5]),
      ],
      { blank: 0, arr: Float32Array.from([5.5, 6.5]) },
    ],
    [
      `struct a {sequence<float> first; sequence<float> second;};`,
      "a",
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...float32Buffer([5.5, 6.5]),
      ],
      {
        first: Float32Array.from([5.5, 6.5]),
        second: Float32Array.from([5.5, 6.5]),
      },
    ],
    [`struct a {string sample; /** empty string */ };`, "a", serializeString(""), { sample: "" }],
    [
      `struct a {string sample; /** some  string */};`,
      "a",
      serializeString("some string"),
      { sample: "some string" },
    ],
    [
      `struct a {int8 first[4];};`,
      "a",
      [0x00, 0xff, 0x80, 0x7f],
      { first: new Int8Array([0, -1, -128, 127]) },
    ],
    [
      `struct a {sequence<int8> first;};`,
      "a",
      [
        ...[0x04, 0x00, 0x00, 0x00], // length
        0x00,
        0xff,
        0x80,
        0x7f,
      ],
      { first: new Int8Array([0, -1, -128, 127]) },
    ],
    [
      `struct a {uint8 first[4];};`,
      "a",
      [0x00, 0xff, 0x80, 0x7f],
      { first: new Uint8Array([0x00, 0xff, 0x80, 0x7f]) },
    ],
    [
      `struct a {uint8 first[2][2];};`,
      "a",
      [0x00, 0xff, 0x80, 0x7f],
      { first: [new Uint8Array([0x00, 0xff]), new Uint8Array([0x80, 0x7f])] },
    ],
    [
      `struct a {uint8 first[2][1];};`,
      "a",
      [0xff, 0x80],
      { first: [new Uint8Array([0xff]), new Uint8Array([0x80])] },
    ],
    [
      `struct a {string first[2];};`,
      "a",
      [...serializeString("one"), ...serializeString("longer string")],
      { first: ["one", "longer string"] },
    ],
    [
      `struct a {sequence<string> first;};`,
      "a",
      [
        ...[0x02, 0x00, 0x00, 0x00], // length
        ...serializeString("one"),
        ...serializeString("longer string"),
      ],
      { first: ["one", "longer string"] },
    ],
    // first size value after fixed size value
    [`struct a {int8 first; int8 second;};`, "a", [0x80, 0x7f], { first: -128, second: 127 }],
    [
      `struct a {string first; int8 second;};`,
      "a",
      [...serializeString("some string"), 0x80],
      { first: "some string", second: -128 },
    ],
    [
      `
    struct a { custom_type::CustomType custom; };
    module custom_type { struct CustomType { uint8 first; }; };
    `,
      "a",
      [0x02],
      {
        custom: { first: 0x02 },
      },
    ],
    [
      `struct a { custom_type::CustomType custom[3]; };
    module custom_type { struct CustomType {
      uint8 first;
    };};
    `,
      "a",
      [0x02, 0x03, 0x04],
      {
        custom: [{ first: 0x02 }, { first: 0x03 }, { first: 0x04 }],
      },
    ],
    [
      `struct a { sequence<custom_type::CustomType> custom; };
    module custom_type { struct CustomType { uint8 first; }; };`,
      "a",
      [
        ...[0x03, 0x00, 0x00, 0x00], // length
        0x02,
        0x03,
        0x04,
      ],
      {
        custom: [{ first: 0x02 }, { first: 0x03 }, { first: 0x04 }],
      },
    ],
    // ignore constants
    [
      `module a {
        module b {
          const int8 STATUS_ONE = 1;
          const int8 STATUS_TWO = 2;
        };
        struct c { int8 status; };
      };`,
      "a::c",
      [0x02],
      { status: 2 },
    ],
    // An array of custom types which themselves have a custom type
    // This tests an array's ability to properly size custom types
    [
      `
    struct a { sequence<custom_type::CustomType> custom; };
    module custom_type { struct CustomType {
        custom_type::MoreCustom another;
    };};
    module custom_type { struct MoreCustom {
        uint8 field;
    };};`,
      "a",
      [
        ...[0x03, 0x00, 0x00, 0x00], // length
        0x02,
        0x03,
        0x04,
      ],
      {
        custom: [
          { another: { field: 0x02 } },
          { another: { field: 0x03 } },
          { another: { field: 0x04 } },
        ],
      },
    ],
  ])(
    "should deserialize %s",
    (msgDef: string, rootDef: string, arr: Iterable<number>, expected: Record<string, unknown>) => {
      const buffer = Uint8Array.from([0, 1, 0, 0, ...arr]);
      const reader = new MessageReader(rootDef, parseIDL(msgDef));
      const read = reader.readMessage(buffer);

      // check that our message matches the object
      expect(read).toEqual(expected);
    },
  );

  it("should deserialize ros2idl tf2_msg/TFMessage", () => {
    // same buffer as above
    const buffer = Uint8Array.from(
      Buffer.from(
        "0001000001000000286fae6169ddd73108000000747572746c6531000e000000747572746c65315f616865616400000000000000000000000000f03f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000f03f",
        "hex",
      ),
    );
    const msgDef = `

module geometry_msgs {
  module msg {
    struct Transforms {
      sequence<geometry_msgs::msg::TransformStamped> transforms;
    };
  };
};

module geometry_msgs {
  module msg {
    struct TransformStamped {
      std_msgs::msg::Header header;
      string child_frame_id; // the frame id of the child frame
      geometry_msgs::msg::Transform transform;
    };
  };
};

module std_msgs {
  module msg {
    struct Header {
      builtin_interfaces::Time stamp;
      string frame_id;
    };
  };
};

module geometry_msgs {
  module msg {
    struct Transform {
      geometry_msgs::msg::Vector3 translation;
      geometry_msgs::msg::Quaternion rotation;
    };
  };
};

module geometry_msgs {
  module msg {
    struct Vector3 {
      double x;
      double y;
      double z;
    };
  };
};

module geometry_msgs {
  module msg {
    struct Quaternion {
      double x;
      double y;
      double z;
      double w;
    };
  };
};

// Normally added when generating idl schemas

module builtin_interfaces {
  struct Time {
    int32 sec;
    uint32 nanosec;
  };
};
    `;
    const reader = new MessageReader("geometry_msgs::msg::Transforms", parseIDL(msgDef));
    const read = reader.readMessage(buffer);

    expect(read).toEqual({
      transforms: [
        {
          header: {
            stamp: { sec: 1638821672, nanosec: 836230505 },
            frame_id: "turtle1",
          },
          child_frame_id: "turtle1_ahead",
          transform: {
            translation: { x: 1, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    });
  });

  it("fails on wchar", () => {
    const msgDef = `
        @mutable
        struct Address {
            wchar member;
        };
    `;

    const rootDef = "Address";

    expect(() => new MessageReader(rootDef, parseIDL(msgDef))).toThrow(
      /'wchar' and 'wstring' types are not supported/i,
    );
  });
  it("fails on wstring", () => {
    const msgDef = `
        @mutable
        struct Address {
            wstring member;
        };
    `;

    const rootDef = "Address";
    expect(() => new MessageReader(rootDef, parseIDL(msgDef))).toThrow(
      /'wchar' and 'wstring' types are not supported/i,
    );
  });

  it("reads simple mutable struct", () => {
    const msgDef = `
        @mutable
        struct Address {
            octet pointer;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    writer.dHeader(1); // first writes dHeader for struct object - not taken into consideration for objects
    writer.emHeader(true, 1, 1); // then writes emHeader for struct object
    writer.uint8(0x0f); // then writes the octet

    const rootDef = "Address";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({ pointer: 15 });
  });

  it("reads simple nested mutable struct", () => {
    const msgDef = `
        @mutable
        struct Address {
            octet pointer;
        };
        @mutable
        struct Person {
          double heightMeters;
          Address address;
          uint8 age;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    const data = {
      heightMeters: 1.8,
      address: {
        pointer: 15,
      },
      age: 30,
    };

    writer.dHeader(1);
    writer.emHeader(true, 1, 8); // heightMeters emHeader
    writer.float64(data.heightMeters);
    writer.emHeader(true, 2, 4 + 4 + 1); // address emHeader
    // dHeader for inner object not written again because the object size is already specified in the emHeader and the lengthCode of 5 allows it to not be written again
    writer.emHeader(true, 1, 1, 5); // pointer emHeader
    writer.uint8(data.address.pointer);
    writer.emHeader(true, 3, 1); // age emHeader
    writer.uint8(data.age);

    const rootDef = "Person";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({
      heightMeters: 1.8,
      address: { pointer: 15 },
      age: 30,
    });
  });

  it("PL_CDRv1: reads simple mutable struct", () => {
    const msgDef = `
        @mutable
        struct Address {
            octet pointer;
        };
    `;

    // PL_CDRv1 does not have dHeaders and uses sentinel headers
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(true, 1, 1); // then writes emHeader for struct object
    writer.uint8(0x0f); // then writes the octet
    writer.sentinelHeader();

    const rootDef = "Address";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({ pointer: 15 });
  });

  it("PL_CDRv1: reads simple nested mutable struct", () => {
    const msgDef = `
        @mutable
        struct Address {
            octet pointer;
        };
        @mutable
        struct Person {
          double heightMeters;
          Address address;
          uint8 age;
        };
    `;

    // PL_CDRv1 does not have dHeaders and uses sentinel headers
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    const data = {
      heightMeters: 1.8,
      address: {
        pointer: 15,
      },
      age: 30,
    };

    writer.emHeader(true, 1, 8); // heightMeters emHeader
    writer.float64(data.heightMeters);
    writer.emHeader(true, 2, 4 + 4 + 1); // address emHeader
    // dHeader for inner object not written again because the object size is already specified in the emHeader
    writer.emHeader(true, 1, 1); // pointer emHeader
    writer.uint8(data.address.pointer);
    writer.sentinelHeader();
    writer.emHeader(true, 3, 1); // age emHeader
    writer.uint8(data.age);
    writer.sentinelHeader();

    const rootDef = "Person";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({
      heightMeters: 1.8,
      address: { pointer: 15 },
      age: 30,
    });
  });

  it("reads mutable structs with arrays where size is in emHeader only", () => {
    // size in only emheader means that lengthcode > 4
    const msgDef = `
        @mutable
        struct Plot {
          string name;
          sequence<double> xValues;
          sequence<double> yValues;
          uint32 count;
        };
    `;

    const writer = new CdrWriter({ size: 256, kind: EncapsulationKind.PL_CDR2_LE });
    const data = {
      name: "MPG",
      xValues: [1, 2, 3],
      yValues: [4, 5, 6],
      count: 3,
    };

    writer.dHeader(1);
    writer.emHeader(true, 1, data.name.length + 1, 2); // "name" field emHeader. add 1 for null terminator
    writer.string(data.name, true); // need to write length because lengthCode < 5

    writer.emHeader(true, 2, 3 * 8, 7); // xValues emHeader
    writer.float64Array(data.xValues, false); // do not write length of array again. Already included in emHeader when lengthCode is 7

    // size in only emheader means that lengthcode > 4
    writer.emHeader(true, 3, 3 * 8, 7); // yValues emHeader, lengthCode = 7 means we don't have to write sequenceLength
    writer.float64Array(data.yValues, false); // do not write length of array again. Already included in emHeader

    writer.emHeader(true, 4, 4); // count emHeader
    writer.uint32(data.count);

    const rootDef = "Plot";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({
      name: "MPG",
      xValues: new Float64Array([1, 2, 3]),
      yValues: new Float64Array([4, 5, 6]),
      count: 3,
    });
  });

  it("reads mutable structs with arrays using length codes that cause sequenceLength to be written", () => {
    const msgDef = `
        @mutable
        struct Plot {
          string name;
          sequence<double> xValues;
          sequence<double> yValues;
          uint32 count;
        };
    `;

    const writer = new CdrWriter({ size: 256, kind: EncapsulationKind.PL_CDR2_LE });
    const data = {
      name: "MPG",
      xValues: [1, 2, 3],
      yValues: [4, 5, 6],
      count: 3,
    };

    writer.dHeader(1);
    writer.emHeader(true, 1, data.name.length + 1, 2); // "name" field emHeader. add 1 for null terminator
    writer.string(data.name, true); // need to write length because lengthCode < 5
    writer.emHeader(true, 2, 3 * 8 + 1, 4); // xValues emHeader
    writer.float64Array(data.xValues, /*writeLength:*/ true); // write length because lengthCode < 5

    writer.emHeader(true, 3, 3 * 8 + 1, 4); // yValues emHeader
    writer.float64Array(data.yValues, /*writeLength:*/ true); // write length because lengthCode < 5

    writer.emHeader(true, 4, 4); // count emHeader
    writer.uint32(data.count);

    const rootDef = "Plot";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({
      name: "MPG",
      xValues: new Float64Array([1, 2, 3]),
      yValues: new Float64Array([4, 5, 6]),
      count: 3,
    });
  });

  it("reads multi-dimensional fixed size arrays", () => {
    const msgDef = `
        @mutable
        struct Grid {
          float table[2][3];
        };
    `;

    const data = {
      grid: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    };
    const writer = new CdrWriter({ size: 1028, kind: EncapsulationKind.PL_CDR2_LE });
    writer.emHeader(true, 1, data.grid.length * data.grid[0]!.length * 4); // size of grid
    for (const row of data.grid) {
      writer.float32Array(row, false); // do not write length for fixed-size arrays
    }

    const rootDef = "Grid";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));
    expect(reader.readMessage(writer.data)).toEqual({
      table: [new Float32Array([1, 2, 3]), new Float32Array([4, 5, 6])],
    });
  });

  it("reads an empty double (8-byte) array", () => {
    const msgDef = `
        @mutable
        struct Array {
          sequence<double> numbers;
        };
    `;

    const writer = new CdrWriter({ size: 256, kind: EncapsulationKind.PL_CDR2_LE });
    const data = {
      numbers: [],
    };

    writer.dHeader(1); // dHeader of struct
    writer.emHeader(true, 1, data.numbers.length + 4, 2); // writes 4 because the sequence length is after it
    writer.sequenceLength(0); // Because its lengthCode < 5

    const rootDef = "Array";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    expect(reader.readMessage(writer.data)).toEqual({
      numbers: new Float64Array([]),
    });
  });

  it("throws if rootDef is not found", () => {
    const msgDef = `
    struct a { int8 sample; };
    `;
    expect(() => new MessageReader("b", parseIDL(msgDef))).toThrow(/"b" not found/i);
  });

  it("Reads mutable union field with id", () => {
    const msgDef = `
        @mutable
        union ColorOrGray switch (uint8) {
          case 0:
            @id(100)
            uint8 rgb[3];
          case 3:
            @id(200)
            uint8 gray;
        };
        @mutable
        struct Fence {
            @id(5) ColorOrGray color;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(true, 5, 6); // writes emHeader for color field

    writer.emHeader(true, 1, 1); // emHeader for discriminator (switch type)
    writer.uint8(0x03); // then writes uint8 case for gray

    writer.emHeader(true, 200, 1); // emHeader for field (gray)
    writer.uint8(55); // then writes uint8

    writer.sentinelHeader(); // end union
    writer.sentinelHeader(); // end struct

    const rootDef = "Fence";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual({
      color: {
        [UNION_DISCRIMINATOR_PROPERTY_KEY]: 3,
        gray: 55,
      },
    });
  });

  it("Reads mutable union with default case with id where discriminator case does not exist", () => {
    const msgDef = `
        @mutable
        union ColorOrGray switch (uint8) {
          case 0:
            @id(100)
            uint8 rgb[3];
          default:
            @id(200)
            uint8 gray;
        };
        @mutable
        struct Fence {
            @id(5) ColorOrGray color;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(true, 5, 6); // writes emHeader for color field

    writer.emHeader(true, 1, 1); // emHeader for discriminator (switch type)
    writer.uint8(0x09); // then writes uint8 case for gray

    writer.emHeader(true, 200, 1); // emHeader for field (gray)
    writer.uint8(55); // then writes uint8

    writer.sentinelHeader(); // end union
    writer.sentinelHeader(); // end struct

    const rootDef = "Fence";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual({
      color: {
        [UNION_DISCRIMINATOR_PROPERTY_KEY]: 9,
        gray: 55,
      },
    });
  });
  it("Reads mutable union field with with id where discriminator case does not exist and there is no default", () => {
    const msgDef = `
        @mutable
        union ColorOrGray switch (uint8) {
          case 0:
            @id(100)
            uint8 rgb[3];
          case 3:
            @id(200)
            uint8 gray;
        };
        @mutable
        struct Fence {
            @id(5) ColorOrGray color;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(true, 5, 6); // writes emHeader for color field

    writer.emHeader(true, 1, 1); // emHeader for discriminator (switch type)
    writer.uint8(0x09); // then writes uint8 case for gray

    // absent value because discriminator doesn't exist

    writer.sentinelHeader(); // end union
    writer.sentinelHeader(); // end struct

    const rootDef = "Fence";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual({
      color: {
        [UNION_DISCRIMINATOR_PROPERTY_KEY]: 9,
      },
    });
  });
  it("Reads array from mutable union field", () => {
    const msgDef = `
        @mutable
        union ColorOrGray switch (uint8) {
          case 0:
            uint8 rgb[3];
          case 3:
            uint8 gray;
        };
        @mutable
        struct Fence {
            @id(5) ColorOrGray color;
        };
    `;

    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(true, 5, 6); // writes emHeader for color field

    writer.emHeader(true, 1, 1); // emHeader for discriminator (switch type)
    writer.uint8(0x00); // then writes uint8 case for rgb

    writer.emHeader(true, 2, 3); // emHeader for field (rgb)
    writer.uint8(255); // then writes my favorite color
    writer.uint8(0);
    writer.uint8(0);

    writer.sentinelHeader(); // end union
    writer.sentinelHeader(); // end struct

    const rootDef = "Fence";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual({
      color: {
        [UNION_DISCRIMINATOR_PROPERTY_KEY]: 0,
        rgb: Uint8Array.from([255, 0, 0]),
      },
    });
  });

  it("Reads a complex PL_CDR2, mutable sequence with underlying mutable struct", () => {
    const msgDef = `
      @mutable
      struct Inner {
        @id(100) uint8 a;
      };

      @mutable
      struct Outer {
        @id(10) sequence<Inner> arr;
      };
    `;
    const data = {
      arr: [{ a: 5 }, { a: 10 }],
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    writer.dHeader(30); // size 4-byte writes + two 1-byte writes
    writer.emHeader(true, 10, 26); // writes emHeader for arr field sequence
    writer.sequenceLength(data.arr.length);
    for (const inner of data.arr) {
      writer.dHeader(8); // write dHeader for Inner struct
      writer.emHeader(true, 100, 1); // writes emHeader for a field
      writer.uint8(inner.a);
    }

    const rootDef = "Outer";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });

  it("Reads mutable struct with string field that uses lengthCode = 4", () => {
    const msgDef = `
      @mutable
      struct Message {
        @id(10) string text;
      };
    `;
    const data = {
      text: "this is a string",
    };
    const lengthCode = 4;
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    const cdrTextSizeBytes = data.text.length + 1; // +1 to include null terminator
    writer.dHeader(8 + 4 + cdrTextSizeBytes); // emHeader 8 bytes header, 4 bytes sequenelength + nextint, then string length
    writer.emHeader(true, 10, cdrTextSizeBytes, lengthCode); // emHeader does not take place of sequence length
    writer.string(data.text, true); // write length because of lengthCode value 4

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });

  it("Reads mutable struct with string field that uses high lengthCode = 5", () => {
    const msgDef = `
      @mutable
      struct Message {
        @id(10) string text;
      };
    `;
    const data = {
      text: "this is a string",
    };
    const lengthCode = 5;
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    const cdrTextSizeBytes = data.text.length + 1; // +1 to include null terminator
    writer.dHeader(8 + cdrTextSizeBytes); // emHeader 8 bytes header + nextint, then string length
    writer.emHeader(true, 10, cdrTextSizeBytes, lengthCode); // emHeader includes string length, because of high length code
    writer.string(data.text, false); // no need to write length because of high length code

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });

  it("Reads mutable struct with an optional field that is absent", () => {
    const msgDef = `
      @mutable
      struct Message {
        @optional @id(1) uint8 bittybyte;
        @optional @id(2) uint32 bytier;
      };
    `;
    const data = {
      bittybyte: undefined,
      bytier: 24,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 2, 4, 0);
    writer.uint32(data.bytier);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });

  it("Reads mutable struct that ends on absent field", () => {
    const msgDef = `
      @mutable
      struct Message {
        @optional @id(100) uint8 bittybyte;
        @optional @id(200) uint32 bytier;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: undefined,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });

  it("Reads mutable struct with absent inner struct member last", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @id(100) float floaty;
      };
      @mutable
      struct Message {
        @optional @id(100) uint8 bittybyte;
        @optional @id(200) uint32 bytier;
        @optional @id(300) InnerMessage inner;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: 9,
      inner: undefined,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 200, 4, 0);
    writer.uint32(data.bytier);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with absent inner struct member first", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @id(100) float floaty;
      };
      @mutable
      struct Message {
        @optional @id(100) InnerMessage inner;
        @optional @id(200) uint8 bittybyte;
        @optional @id(300) uint32 bytier;
      };
    `;
    const data = {
      inner: undefined,
      bittybyte: 5,
      bytier: 9,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 200, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 300, 4, 0);
    writer.uint32(data.bytier);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with absent inner struct member in middle", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @id(100) float floaty;
      };
      @mutable
      struct Message {
        @optional @id(100) uint8 bittybyte;
        @optional @id(200) InnerMessage inner;
        @optional @id(300) uint32 bytier;
      };
    `;
    const data = {
      bittybyte: 5,
      inner: undefined, // optional fields are populated with undefined
      bytier: 9,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 300, 4, 0);
    writer.uint32(data.bytier);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with inner struct in middle with absent optional member", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @optional @id(100) float floaty;
      };
      @mutable
      struct Message {
        @optional @id(100) uint8 bittybyte;
        @optional @id(200) InnerMessage inner;
        @optional @id(300) uint32 bytier;
      };
    `;
    const data = {
      bittybyte: 5,
      inner: {
        floaty: undefined, // optional fields are populated with undefined
      },
      bytier: 9,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 200, 4, 0); // size 4 because it should include sentinel header
    writer.sentinelHeader(); // end of inner struct
    writer.emHeader(false, 300, 4, 0);
    writer.uint32(data.bytier);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with inner struct last with absent optional member", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @optional @id(100) float floaty;
      };
      @mutable
      struct Message {
        @optional @id(100) uint8 bittybyte;
        @optional @id(200) uint32 bytier;
        @optional @id(300) InnerMessage inner;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: 9,
      inner: {
        floaty: undefined, // optional fields are populated with undefined
      },
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 200, 4, 0);
    writer.uint32(data.bytier);
    writer.emHeader(false, 300, 4, 0); // size 4 because it should include sentinel header
    writer.sentinelHeader(); // end of inner struct
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with absent field before inner struct member with empty field", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @optional @id(100) float floaty;
      };
      @mutable
      struct Message {
        @optional @id(100) uint8 bittybyte;
        @optional @id(200) uint32 bytier;
        @optional @id(300) InnerMessage inner;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: undefined, // optional fields are populated with undefined
      inner: {
        floaty: undefined,
      },
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 300, 4, 0); // size 4 because it should include sentinel header
    writer.sentinelHeader(); // end of inner struct
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with absent field before inner struct optional member with empty field that isn't the last populated field", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @optional @id(100) float floaty;
      };
      @mutable
      struct Message {
        @optional @id(100) uint8 bittybyte;
        @optional @id(200) InnerMessage inner;
        @optional @id(300) uint32 bytier;
      };
    `;
    const data = {
      bittybyte: undefined, // optional fields are populated with undefined
      inner: {
        floaty: undefined,
      },
      bytier: 24,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 200, 4, 0); // size 4 because it should include sentinel header
    writer.sentinelHeader(); // end of inner struct
    writer.emHeader(false, 300, 4, 0);
    writer.uint32(data.bytier);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with inner struct in middle with absent non-optional member", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @id(100) float floaty;
      };
      @mutable
      struct Message {
        @id(100) uint8 bittybyte;
        @id(200) InnerMessage inner;
        @id(300) uint32 bytier;
      };
    `;
    const data = {
      bittybyte: 5,
      inner: {
        floaty: 0,
      },
      bytier: 9,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 200, 4, 0); // size 4 because it should include sentinel header
    writer.sentinelHeader(); // end of inner struct
    writer.emHeader(false, 300, 4, 0);
    writer.uint32(data.bytier);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with inner struct last with absent non-optional member", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @id(100) float floaty;
      };
      @mutable
      struct Message {
        @id(100) uint8 bittybyte;
        @id(200) uint32 bytier;
        @id(300) InnerMessage inner;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: 9,
      inner: {
        floaty: 0, // non-optional fields populated with defaults
      },
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 200, 4, 0);
    writer.uint32(data.bytier);
    writer.emHeader(false, 300, 4, 0); // size 4 because it should include sentinel header
    writer.sentinelHeader(); // end of inner struct
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with absent field before inner struct non-optional member with empty field", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @id(100) float floaty;
      };
      @mutable
      struct Message {
        @id(100) uint8 bittybyte;
        @id(200) uint32 bytier;
        @id(300) InnerMessage inner;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: 0, // non-optional fields populated with defaults
      inner: {
        floaty: 0,
      },
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 100, 1, 0);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 300, 4, 0); // size 4 because it should include sentinel header
    writer.sentinelHeader(); // end of inner struct
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with absent non-optional field before inner struct member with empty field that isn't the last populated field", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @id(100) float floaty;
      };
      @mutable
      struct Message {
        @id(100) uint8 bittybyte;
        @id(200) InnerMessage inner;
        @id(300) uint32 bytier;
      };
    `;
    const data = {
      bittybyte: 0, // non-optional fields populated with defaults
      inner: {
        floaty: 0,
      },
      bytier: 24,
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.emHeader(false, 200, 4, 0); // size 4 because it should include sentinel header
    writer.sentinelHeader(); // end of inner struct
    writer.emHeader(false, 300, 4, 0);
    writer.uint32(data.bytier);
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads struct with no members", () => {
    const msgDef = `
      struct Message {
      };
    `;
    const data = {};
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });

    const rootDef = "Message";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));
    const msgout = reader.readMessage(writer.data);
    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with absent inner struct member at the end using PL_CDR2", () => {
    const msgDef = `
      @mutable
      struct InnerMessage {
        @id(100) float floaty;
      };
      @mutable
      struct Message {
        @optional @id(100) uint8 bittybyte;
        @optional @id(200) uint32 bytier;
        @optional @id(300) InnerMessage inner;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: 9,
      inner: undefined, // optional fields are populated with undefined
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR2_LE });
    writer.dHeader(4 + 1 + 4 + 4);
    writer.emHeader(false, 100, 1, 5);
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 200, 4, 5);
    writer.uint32(data.bytier);

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads final struct with optional field", () => {
    const msgDef = `
      struct InnerMessage {
        float floaty;
      };
      struct Message {
        uint8 bittybyte;
        @optional uint32 bytier;
        InnerMessage inner;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: 9,
      inner: {
        floaty: 2.5, // optional fields are populated with undefined
      },
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.CDR_LE });
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 1, 4, 5); // optional field gets an emHeader to confirm existence
    writer.uint32(data.bytier);
    writer.float32(data.inner.floaty);

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads final struct with absent optional field", () => {
    const msgDef = `
      struct InnerMessage {
        float floaty;
      };
      struct Message {
        uint8 bittybyte;
        @optional uint32 bytier;
        InnerMessage inner;
      };
    `;
    const data = {
      bittybyte: 5,
      bytier: undefined,
      inner: {
        floaty: 2.5, // optional fields are populated with undefined
      },
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.CDR_LE });
    writer.uint32(data.bittybyte);
    writer.emHeader(false, 1, 0, 5); // optional field gets an emHeader even though it is undefined
    writer.float32(data.inner.floaty);

    const rootDef = "Message";

    const reader = new MessageReader(rootDef, parseIDL(msgDef));

    const msgout = reader.readMessage(writer.data);

    expect(msgout).toEqual(data);
  });
  it("Reads mutable struct with no members", () => {
    const msgDef = `
      @mutable
      struct Message {
      };
    `;
    const data = {};
    const writer = new CdrWriter({ kind: EncapsulationKind.PL_CDR_LE });
    writer.sentinelHeader(); // end of struct

    const rootDef = "Message";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));
    const msgout = reader.readMessage(writer.data);
    expect(msgout).toEqual(data);
  });
  it("Reads appendable struct with complex inner sequence", () => {
    const msgDef = `
      @appendable
      struct Inner {
        uint32 a;
      };
      @appendable
      struct Outer {
        sequence<Inner> inners;
      };
    `;
    const data = {
      inners: [],
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.RTPS_DELIMITED_CDR2_LE });
    writer.dHeader(8); // for the object
    writer.dHeader(4); // for the inner sequence field
    writer.sequenceLength(0);

    // buffer provided from issue https://github.com/foxglove/omgidl/issues/227
    // written by cyclonedds
    const buffer = new Uint8Array([0, 9, 0, 0, 8, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0]);
    expect(writer.data).toEqual(buffer);

    const rootDef = "Outer";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));
    const msgout = reader.readMessage(buffer);
    expect(msgout).toEqual(data);
  });
  it("Reads appendable struct with primitive inner sequence", () => {
    const msgDef = `
      @appendable
      struct Outer {
        sequence<uint8> inners;
      };
    `;
    const data = {
      inners: new Uint8Array([]),
    };
    const writer = new CdrWriter({ kind: EncapsulationKind.RTPS_DELIMITED_CDR2_LE });
    writer.dHeader(8); // for the object
    writer.dHeader(4); // for the inner sequence field
    writer.sequenceLength(0);

    // buffer provided from issue https://github.com/foxglove/omgidl/issues/227
    // written by cyclonedds
    const buffer = new Uint8Array([0, 9, 0, 0, 8, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0]);
    expect(writer.data).toEqual(buffer);

    const rootDef = "Outer";
    const reader = new MessageReader(rootDef, parseIDL(msgDef));
    const msgout = reader.readMessage(buffer);
    expect(msgout).toEqual(data);
  });
});
