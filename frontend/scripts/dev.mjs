// npm run dev 的啟動器：先設定 NODE_OPTIONS 再啟動 next dev。
// 部分 Windows 電腦在完全沒有 NODE_OPTIONS 時，Turbopack 執行 Tailwind 的子程序會直接結束，
// 畫面顯示 globals.css「Node.js subprocess crashed」；只要有任何值就正常。
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const env = { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--no-deprecation" };

const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
