# Foxglove OMG IDL Monorepo

This repo contains implementations for supporting OMG specifications within [Foxglove Studio](https://www.foxglove.dev).

| Package name                     | Description                                                               | Reference                                                                                                         | Version                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@foxglove/omgidl-parser`        | Parse OMG IDL schema to definitions for Foxglove Studio and serialization | [Interface Definition Language Specification](https://www.omg.org/spec/IDL/4.2/PDF)                               | [![](https://shields.io/npm/v/@foxglove/omgidl-parser)](https://www.npmjs.com/package/@foxglove/omgidl-parser)               |
| `@foxglove/omgidl-serialization` | De/Serialize data using IDL to CDR and CDR2                               | [Extensible and Dynamic Types for DDS Specification](https://www.omg.org/spec/DDS-XTypes/1.2/PDF)                 | [![](https://shields.io/npm/v/@foxglove/omgidl-serialization)](https://www.npmjs.com/package/@foxglove/omgidl-serialization) |
| `@foxglove/ros2idl-parser`       | `ros2idl` schema parser to definitions for serialization                  | [article](https://design.ros2.org/articles/idl_interface_definition.html), [repo](https://github.com/ros2/rosidl) | [![](https://shields.io/npm/v/@foxglove/ros2idl-parser)](https://www.npmjs.com/package/@foxglove/ros2idl-parser)             |

## Setup

```
corepack enable
yarn install
```

## Test

If it's your first time building, you'll need to run `yarn build`.

Then to run test cases across all packages run `yarn test` from the root directory.

Note: to ensure that tests from a downstream in-repo dependency are running against the latest upstream version of code, you'll have to run `yarn build` every time you change the upstream dependency.

The dependency flow is as follows:

- `@foxglove/omgidl-parser` -> `@foxglove/omgidl-serialization`
- `@foxglove/omgidl-parser` -> `@foxglove/ros2idl-parser`

## Deploy packages

## Stay in touch

Join our [Slack channel](https://foxglove.dev/join-slack) to ask questions, share feedback, and stay up to date on what our team is working on.

## License

foxglove/omgidl-support and its packages are licensed under the [MIT License](https://opensource.org/licenses/MIT).
