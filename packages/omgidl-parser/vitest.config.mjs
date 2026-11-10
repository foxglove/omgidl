import nearley from "nearley";
import compile from "nearley/lib/compile.js";
import generate from "nearley/lib/generate.js";
import nearleyGrammar from "nearley/lib/nearley-language-bootstrapped.js";
import { defineProject } from "vitest/config";

export default defineProject({
  root: import.meta.dirname,
  plugins: [
    {
      name: "nearley",
      transform(source, id) {
        if (!id.endsWith(".ne")) {
          return;
        }

        const parser = new nearley.Parser(nearleyGrammar);
        parser.feed(source);
        const grammar = compile(parser.results[0], {});
        grammar.config.preprocessor = "module";

        return {
          code: `import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(id)});
${generate(grammar, "grammar")}`,
          map: null,
        };
      },
    },
  ],
  test: {
    name: "omgidl-parser",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
