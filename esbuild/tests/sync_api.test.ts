import { assertThrows } from "@std/assert";

Deno.test(
  `buildSync throws "The \\"buildSync\\" API does not work in Deno"`,
  () => {
    return import("../mod.ts").then((esbuild) => {
      assertThrows(
        () => esbuild.buildSync({ entryPoints: ["x.ts"] }),
        Error,
        `The "buildSync" API does not work in Deno`,
      );
    });
  },
);

Deno.test(
  `transformSync throws "The \\"transformSync\\" API does not work in Deno"`,
  () => {
    return import("../mod.ts").then((esbuild) => {
      assertThrows(
        () => esbuild.transformSync("const x = 1;", { loader: "ts" }),
        Error,
        `The "transformSync" API does not work in Deno`,
      );
    });
  },
);

Deno.test(
  `formatMessagesSync throws "The \\"formatMessagesSync\\" API does not work in Deno"`,
  () => {
    return import("../mod.ts").then((esbuild) => {
      assertThrows(
        () => esbuild.formatMessagesSync([{ text: "x" }], { kind: "error" }),
        Error,
        `The "formatMessagesSync" API does not work in Deno`,
      );
    });
  },
);

Deno.test(
  `analyzeMetafileSync throws "The \\"analyzeMetafileSync\\" API does not work in Deno"`,
  () => {
    return import("../mod.ts").then((esbuild) => {
      assertThrows(
        () => esbuild.analyzeMetafileSync("{}", {}),
        Error,
        `The "analyzeMetafileSync" API does not work in Deno`,
      );
    });
  },
);
