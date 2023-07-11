# Foxglove OMGIDL Monorepo

This repo contains implementations supporting OMG specifications.

- OMGIDL (Interface Definition Language) Schema Grammar in `nearley`
- OMGIDL schema parser to resolved, flattened definitions
- OMGIDL messages serialization and deserialization to CDR and CDR2
- ROS2IDL schema parser

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

- `@foxglove/omgidl-parser`
  - `@foxglove/omgidl-grammar`
- `@foxglove/omgidl-serialization`
  - `@foxglove/omgidl-parser`
- `@foxglove/ros2idl-parser`
  - `@foxglove/omgidl-parser`

## Deploy packages

## Stay in touch

Join our [Slack channel](https://foxglove.dev/join-slack) to ask questions, share feedback, and stay up to date on what our team is working on.

## License

foxglove/omgidl-support and its packages are licensed under the [MIT License](https://opensource.org/licenses/MIT).
