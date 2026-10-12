// Runtime databases, encryption keys, private notes and environment files belong
// to deployment storage, never to the app's traced dependency artifacts.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

const root = process.cwd();
const privateDirectories = [resolve(root, ".runtime"), resolve(root, ".git"), resolve(process.env.TERMINAL_VAULT_DIR || "obsidian-vault", "Research")];
if (process.env.TERMINAL_DATA_DIR) privateDirectories.push(resolve(process.env.TERMINAL_DATA_DIR));
function privateFile(file) { return basename(file).startsWith(".env") || privateDirectories.some(directory => file === directory || file.startsWith(directory + sep)); }
let removed = 0;
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.name.endsWith(".nft.json")) {
      const manifest = JSON.parse(await readFile(file, "utf8"));
      const original = manifest.files;
      manifest.files = original.filter(path => !privateFile(resolve(dirname(file), path)));
      if (original.length !== manifest.files.length) {
        removed += original.length - manifest.files.length;
        await writeFile(file, JSON.stringify(manifest) + "\n");
      }
    }
  }
}
await visit(resolve(root, ".next"));
console.log(`Build tracing privacy check complete; excluded ${removed} private runtime entries.`);
