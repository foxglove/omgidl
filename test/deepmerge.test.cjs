const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { test } = require("node:test");

// Remove the deepmerge resolution and patch once an upstream release passes these tests without the patch.
const requireFromJest = createRequire(require.resolve("jest"));
const requireFromJestCli = createRequire(requireFromJest.resolve("jest-cli"));
const requireFromJestConfig = createRequire(requireFromJestCli.resolve("jest-config"));
const merge = requireFromJestConfig("deepmerge");

function maliciousObject() {
  return JSON.parse('{"__proto__":{"admin":true}}');
}

function assertSafePrototype(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.hasOwn(value, "__proto__"), false);
  assert.equal(value.admin, undefined);
  assert.equal(Object.prototype.admin, undefined);
}

test("rejects a source prototype key with a plain target", () => {
  assertSafePrototype(merge({}, maliciousObject()));
});

test("rejects a source prototype key with a null prototype target", () => {
  assertSafePrototype(merge(Object.create(null), maliciousObject()));
});

test("rejects a source prototype key over a nested null placeholder", () => {
  assertSafePrototype(merge({ session: null }, { session: maliciousObject() }).session);
});

test("rejects a prototype key copied from the target", () => {
  assertSafePrototype(merge(maliciousObject(), {}));
});

test("rejects prototype keys in cloned array elements", () => {
  const result = merge({ sessions: [maliciousObject()] }, { sessions: [maliciousObject()] });
  assert.equal(result.sessions.length, 2);
  for (const session of result.sessions) {
    assertSafePrototype(session);
  }
});

test("merges nested objects and concatenates arrays without mutating inputs", () => {
  const target = { nested: { left: 1 }, values: [1] };
  const source = { nested: { right: 2 }, values: [2] };
  assert.deepEqual(merge(target, source), { nested: { left: 1, right: 2 }, values: [1, 2] });
  assert.deepEqual(target, { nested: { left: 1 }, values: [1] });
  assert.deepEqual(source, { nested: { right: 2 }, values: [2] });
});

test("preserves enumerable symbols and ordinary constructor and prototype properties", () => {
  const symbol = Symbol("setting");
  const target = JSON.parse('{"constructor":{"left":1},"prototype":{"left":1}}');
  const source = JSON.parse('{"constructor":{"right":2},"prototype":{"right":2}}');
  target[symbol] = { left: 1 };
  source[symbol] = { right: 2 };
  const result = merge(target, source);
  assert.deepEqual(result.constructor, { left: 1, right: 2 });
  assert.deepEqual(result.prototype, { left: 1, right: 2 });
  assert.deepEqual(result[symbol], { left: 1, right: 2 });
  assertSafePrototype(result);
});

test("preserves custom array and property merge options", () => {
  const result = merge(
    { settings: { left: 1 }, values: [1] },
    { settings: { right: 2 }, values: [2] },
    {
      arrayMerge: (_target, source) => source,
      customMerge: (key) => (key === "settings" ? (_target, source) => source : undefined),
    },
  );
  assert.deepEqual(result, { settings: { right: 2 }, values: [2] });
});
