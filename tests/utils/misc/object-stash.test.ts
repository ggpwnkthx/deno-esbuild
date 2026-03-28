import { assertEquals } from "jsr:@std/assert@1.0.19";
import { createObjectStash, replaceDetailsInMessages } from "@ggpwnkthx/esbuild/utils";
import type { Message } from "@ggpwnkthx/esbuild";

Deno.test("createObjectStash().store() and .load() round-trip an arbitrary detail object", () => {
  const stash = createObjectStash();
  const obj = { a: 1, b: "test", c: [1, 2, 3] };
  const id = stash.store(obj);
  assertEquals(id, 0);
  assertEquals(stash.load(id), obj);
});

Deno.test("createObjectStash().store() and .load() round-trip multiple values", () => {
  const stash = createObjectStash();
  const id1 = stash.store({ type: "first" });
  const id2 = stash.store({ type: "second" });
  const id3 = stash.store("just a string");
  assertEquals(id1, 0);
  assertEquals(id2, 1);
  assertEquals(id3, 2);
  assertEquals(stash.load(id1), { type: "first" });
  assertEquals(stash.load(id2), { type: "second" });
  assertEquals(stash.load(id3), "just a string");
});

Deno.test("createObjectStash().store(undefined) returns -1", () => {
  const stash = createObjectStash();
  assertEquals(stash.store(undefined), -1);
  assertEquals(stash.store(void 0), -1);
});

Deno.test("createObjectStash().clear() removes stored values", () => {
  const stash = createObjectStash();
  stash.store({ a: 1 });
  stash.store({ b: 2 });
  assertEquals(stash.load(0), { a: 1 });
  assertEquals(stash.load(1), { b: 2 });
  stash.clear();
  assertEquals(stash.load(0), undefined);
  assertEquals(stash.load(1), undefined);
});

Deno.test("replaceDetailsInMessages() restores stashed detail values", () => {
  const stash = createObjectStash();
  const detail1 = { info: "first" };
  const detail2 = { info: "second" };
  const id1 = stash.store(detail1);
  const id2 = stash.store(detail2);
  const messages: Message[] = [
    { id: "1", pluginName: "", text: "err1", location: null, notes: [], detail: id1 },
    { id: "2", pluginName: "", text: "err2", location: null, notes: [], detail: id2 },
  ];
  const result = replaceDetailsInMessages(messages, stash);
  assertEquals(result[0].detail, detail1);
  assertEquals(result[1].detail, detail2);
});
