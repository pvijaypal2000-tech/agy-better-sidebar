import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const pluginRoot = path.join(
  os.homedir(),
  ".gemini",
  "config",
  "plugins",
  "agy-better-sidebar",
);
const serverEntry = path.join(pluginRoot, "dist", "server.mjs");
const testDataDir = path.join(os.tmpdir(), "agy-better-sidebar-verify-" + Date.now());
const workspaceRoot = path.join(
  os.homedir(),
  ".gemini",
  "antigravity",
  "scratch",
  "agy-better-sidebar",
);

const child = spawn(process.execPath, [serverEntry, "--data-dir", testDataDir], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stderrBuf = "";
child.stderr.on("data", (d) => {
  stderrBuf += d.toString("utf8");
});

let nextId = 1;
const pending = new Map();
let stdoutBuf = "";

child.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString("utf8");
  let nl;
  while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`RPC Error ${msg.error.code}: ${msg.error.message}`));
      else resolve(msg.result);
    }
  }
});

function sendRpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for ${method}`));
    }, 10000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function sendNotif(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function run() {
  try {
    const init = await sendRpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        extensions: {
          "io.modelcontextprotocol/ui": {},
          "com.google.antigravity/ui": { entrypoints: ["aux_pane", "global", "file"] },
        },
      },
      clientInfo: { name: "verify-harness", version: "1.0.0" },
    });
    assert(init.capabilities?.tools && init.capabilities?.resources, "Server must advertise tools & resources");
    sendNotif("notifications/initialized", {});

    const resList = await sendRpc("resources/list", {});
    assert(resList.resources.length === 2, `Expected 2 UI resources, got ${resList.resources.length}`);
    for (const r of resList.resources) {
      assert(r.uri.startsWith("ui://"), `Resource URI must start with ui://: ${r.uri}`);
      assert(r.mimeType === "text/html;profile=mcp-app", `Wrong MIME type for ${r.uri}: ${r.mimeType}`);
      const readRes = await sendRpc("resources/read", { uri: r.uri });
      const html = readRes.contents?.[0]?.text ?? "";
      const bytes = Buffer.byteLength(html, "utf8");
      assert(bytes > 10000, `HTML unexpectedly small for ${r.uri}: ${bytes}`);
      assert(bytes < 10 * 1024 * 1024, `HTML exceeds 10 MiB limit for ${r.uri}: ${bytes}`);
      assert(!/<script[^>]+src=["']https?:/i.test(html), `External script found in ${r.uri}`);
      assert(!/<link[^>]+href=["']https?:/i.test(html), `External stylesheet found in ${r.uri}`);
      console.log(`[PASS] Resource ${r.uri}: ${(bytes / (1024 * 1024)).toFixed(2)} MiB, offline CSP clean`);
    }

    const toolsList = await sendRpc("tools/list", {});
    const wbTool = toolsList.tools.find((t) => t.name === "open_sidebar_workbench");
    const fvTool = toolsList.tools.find((t) => t.name === "open_file_viewer");
    assert(wbTool?._meta?.ui?.resourceUri === "ui://agy-better-sidebar/workbench.html", "Missing workbench resourceUri");
    assert(
      wbTool?._meta?.["com.google.antigravity/ui"]?.entrypoints?.length === 2,
      "Workbench must have aux_pane & global entrypoints",
    );
    assert(fvTool?._meta?.ui?.resourceUri === "ui://agy-better-sidebar/viewer.html", "Missing viewer resourceUri");
    const fvEntry = fvTool?._meta?.["com.google.antigravity/ui"]?.entrypoints?.[0];
    assert(fvEntry?.type === "file" && fvEntry.extensions.length > 40, "Viewer must claim file extensions");
    console.log(`[PASS] Tools metadata verified (${toolsList.tools.length} tools, ${fvEntry.extensions.length} file extensions)`);

    // Test manual empty-arg launch
    const wbCall = await sendRpc("tools/call", { name: "open_sidebar_workbench", arguments: {} });
    assert(!wbCall.isError && wbCall.structuredContent?.initialWorkspace, "Manual empty-arg workbench launch failed");
    console.log(`[PASS] open_sidebar_workbench({}) -> ${wbCall.structuredContent.initialWorkspace}`);

    // Test file viewer invocation
    const fvCall = await sendRpc("tools/call", {
      name: "open_file_viewer",
      arguments: { file: { name: "sample.py", resourceUri: "antigravity-file://abc/sample.py" } },
    });
    assert(!fvCall.isError && fvCall.structuredContent?.file?.name === "sample.py", "open_file_viewer call failed");
    console.log("[PASS] open_file_viewer(file) verified");

    // Test directory list, find, read, and traversal block
    const dirRes = await sendRpc("tools/call", {
      name: "app_list_dir",
      arguments: { rootPath: workspaceRoot, relPath: "" },
    });
    assert(!dirRes.isError && dirRes.structuredContent.entries.length > 0, "app_list_dir failed");
    console.log(`[PASS] app_list_dir -> ${dirRes.structuredContent.entries.length} entries`);

    const findRes = await sendRpc("tools/call", {
      name: "app_find_files",
      arguments: { rootPath: workspaceRoot, query: "CodeReader" },
    });
    assert(!findRes.isError && findRes.structuredContent.entries.some((e) => e.name === "CodeReader.tsx"), "app_find_files failed");
    console.log(`[PASS] app_find_files("CodeReader") -> ${findRes.structuredContent.entries.length} match(es)`);

    const readRes = await sendRpc("tools/call", {
      name: "app_read_file",
      arguments: { rootPath: workspaceRoot, relPath: "package.json" },
    });
    assert(!readRes.isError && readRes.structuredContent.content.includes("agy-better-sidebar"), "app_read_file failed");
    console.log(`[PASS] app_read_file("package.json") -> ${readRes.structuredContent.size} bytes`);

    const escapeRes = await sendRpc("tools/call", {
      name: "app_read_file",
      arguments: { rootPath: workspaceRoot, relPath: "../../../../Windows/win.ini" },
    });
    assert(escapeRes.isError === true, "Path traversal MUST be rejected!");
    console.log("[PASS] Path traversal guard blocked escape attempt");

    const browseRes = await sendRpc("tools/call", {
      name: "app_browse_dirs",
      arguments: { dirPath: "__drives__" },
    });
    assert(!browseRes.isError && browseRes.structuredContent.entries.length > 0, "app_browse_dirs failed");
    console.log(`[PASS] app_browse_dirs("__drives__") -> ${browseRes.structuredContent.entries.length} drive(s)`);

    const prefRes = await sendRpc("tools/call", {
      name: "app_save_prefs",
      arguments: { prefs: { themePreset: "lapis", tableStyle: "threeline", fontSize: 16 }, lastWorkspace: workspaceRoot },
    });
    assert(
      !prefRes.isError &&
        prefRes.structuredContent.prefs.themePreset === "lapis" &&
        prefRes.structuredContent.prefs.tableStyle === "threeline",
      "app_save_prefs failed",
    );
    console.log("[PASS] app_save_prefs persisted Lapis & threeline table prefs");

    const recentRes = await sendRpc("tools/call", {
      name: "app_get_recent_changes",
      arguments: { rootPath: workspaceRoot },
    });
    assert(!recentRes.isError && recentRes.structuredContent.items.length > 0, "app_get_recent_changes failed");
    assert(
      recentRes.structuredContent.autoOpenPaths.length > 0 &&
        !recentRes.structuredContent.autoOpenPaths.some((p) => p.endsWith("package-lock.json")),
      "autoOpenPaths must contain clean readable files without lockfiles",
    );
    console.log(
      `[PASS] app_get_recent_changes -> ${recentRes.structuredContent.items.length} items, autoOpen: ${recentRes.structuredContent.autoOpenPaths.join(", ")}`,
    );

    if (stderrBuf.trim()) {
      console.warn("[WARN] Server stderr:", stderrBuf.trim());
    }
    console.log("\nALL MCP PROTOCOL & SECURITY CHECKS PASSED!");
  } finally {
    child.kill();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
