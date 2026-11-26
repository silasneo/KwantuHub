import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--watch", "server/_core/index.ts"],
  {
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "inherit",
  }
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
