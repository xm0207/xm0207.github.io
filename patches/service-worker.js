/**
 * service-worker.js — 合并入口
 *
 * 官方构建产物中的 service-worker.js（JIT 即时编译 worker，仅 localhost 生效）
 * 在部署脚本中被重命名为 sw-jit.js，本文件取而代之，同时挂载两套逻辑：
 *   - sw-fs.js  : OPFS 虚拟文件系统（extension 资源 + 文件 RPC 仿真）
 *   - sw-jit.js : 官方 TS/Vue 即时编译（本地开发时使用）
 *
 * fs 的 fetch 监听器先注册，优先处理 extension/* 与文件 RPC 请求；
 * 未被 respondWith 的请求自动落入 JIT worker 或直连网络。
 *
 * 游戏本体的注册逻辑（packages/jit/src/entry.ts 注入 index.html 的脚本）
 * 会以 module 类型注册 `${scope}service-worker.js`，无需额外改动。
 */
import "./sw-fs.js";
import "./sw-jit.js";
