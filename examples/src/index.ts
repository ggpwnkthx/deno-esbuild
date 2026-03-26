import { value } from "./shared.ts";

const mod = await import("./shared.ts");
console.log(mod.utils);
console.log("Value:", value);
