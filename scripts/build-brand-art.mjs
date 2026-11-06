import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const theme of ["light", "dark"]) {
  execFileSync("typst", [
    "compile", "--input", `theme=${theme}`, "--format", "svg",
    "design/typst/ripple-field.typ",
    `frontend/public/art/ripple-field-${theme}.svg`,
  ], { cwd: root, stdio: "inherit" });
}
