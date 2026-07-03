/**
 * sw-fs.js — 无名杀 OPFS 虚拟文件系统 Service Worker（module）
 *
 * 两个职责：
 *
 * 1.【静态资源拦截】scope 内所有 extension/... 的 GET 请求，OPFS 优先返回，
 *   未命中回退网络。这样通过 preload.js 写入 OPFS 的扩展文件（extension.js、
 *   武将图、语音等）就能像真实服务器文件一样被游戏以 URL 方式加载。
 *
 * 2.【RPC 端点仿真】完整实现 packages/fs 本地服务器的 HTTP 协议
 *   (/checkFile /checkDir /readFile /readFileAsText /writeFile
 *    /removeFile /getFileList /createDir /removeDir)。
 *   注意 init/browser.js 中这些请求是绝对根路径（如 fetch("/checkFile?...")），
 *   因此仅当游戏部署在【域名根路径】时才会落在本 SW 的 scope 内被拦截。
 *   部署在子路径（如 /noname/）时请配合 preload.js 使用，此部分自动闲置。
 *
 * 本文件由 service-worker.js（合并入口）import，与官方 JIT worker 并存：
 * JIT worker 只在 localhost 生效，二者的拦截路径互不冲突。
 */

const sw = globalThis;

sw.addEventListener("install", () => sw.skipWaiting());
sw.addEventListener("activate", event => event.waitUntil(sw.clients.claim()));

// ------------------------------------------------------------------
// OPFS 工具（与 preload.js 中同构，SW 上下文独立所以需要一份拷贝）
// ------------------------------------------------------------------
let _root = null;
const getRoot = async () => (_root ??= await navigator.storage.getDirectory());

const norm = p => {
	const out = [];
	String(p)
		.replace(/\\/g, "/")
		.split("/")
		.forEach(seg => {
			if (!seg || seg === ".") return;
			if (seg === "..") {
				out.pop();
				return;
			}
			out.push(seg);
		});
	return out;
};

async function dirHandle(segs, create = false) {
	let h = await getRoot();
	for (const s of segs) h = await h.getDirectoryHandle(s, { create });
	return h;
}

async function stat(segs) {
	if (segs.length === 0) return "directory";
	let parent;
	try {
		parent = await dirHandle(segs.slice(0, -1));
	} catch {
		return null;
	}
	const name = segs[segs.length - 1];
	try {
		await parent.getFileHandle(name);
		return "file";
	} catch {}
	try {
		await parent.getDirectoryHandle(name);
		return "directory";
	} catch {}
	return null;
}

async function readOpfsFile(segs) {
	const dir = await dirHandle(segs.slice(0, -1));
	const fh = await dir.getFileHandle(segs[segs.length - 1]);
	return await fh.getFile();
}

// ------------------------------------------------------------------
// MIME 表（Content-Type 对 ES module import 至关重要）
// ------------------------------------------------------------------
const MIME = {
	js: "text/javascript",
	mjs: "text/javascript",
	ts: "text/javascript",
	json: "application/json",
	css: "text/css",
	html: "text/html",
	htm: "text/html",
	txt: "text/plain",
	md: "text/markdown",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	mp3: "audio/mpeg",
	ogg: "audio/ogg",
	wav: "audio/wav",
	m4a: "audio/mp4",
	mp4: "video/mp4",
	webm: "video/webm",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
	wasm: "application/wasm",
};
const mimeOf = name => {
	const ext = (name.split(".").pop() || "").toLowerCase();
	return MIME[ext] || "application/octet-stream";
};

// ------------------------------------------------------------------
// RPC 仿真：响应格式对齐 packages/fs 的 wrap()
//   成功: { success: true, data }   失败: { success: false, errorMsg }
// ------------------------------------------------------------------
const ok = data => new Response(JSON.stringify({ success: true, data }), { headers: { "Content-Type": "application/json" } });
const fail = e => new Response(JSON.stringify({ success: false, errorMsg: (e && e.message) || String(e) }), { headers: { "Content-Type": "application/json" } });

const RPC = {
	async checkFile(params) {
		const segs = norm(params.get("fileName") || "");
		const s = await stat(segs);
		if (s) return s; // "file" | "directory"
		// 网络回退：静态站点上的真实文件（供 browser.js 启动探测 noname.js 使用）
		try {
			const res = await fetch(new URL(segs.join("/"), sw.registration.scope), { method: "HEAD" });
			if (res.ok) return "file";
		} catch {}
		return "none"; // browser.js 的 switch 会将未知值映射为 -1
	},
	async checkDir(params) {
		const s = await stat(norm(params.get("dir") || ""));
		return s || "none";
	},
	async readFile(params) {
		const segs = norm(params.get("fileName") || "");
		try {
			const file = await readOpfsFile(segs);
			return [...new Uint8Array(await file.arrayBuffer())];
		} catch {}
		const res = await fetch(new URL(segs.join("/"), sw.registration.scope));
		if (!res.ok) throw new Error(`文件不存在: ${segs.join("/")}`);
		return [...new Uint8Array(await res.arrayBuffer())];
	},
	async readFileAsText(params) {
		const segs = norm(params.get("fileName") || "");
		try {
			const file = await readOpfsFile(segs);
			return await file.text();
		} catch {}
		const res = await fetch(new URL(segs.join("/"), sw.registration.scope));
		if (!res.ok) throw new Error(`文件不存在: ${segs.join("/")}`);
		return await res.text();
	},
	async writeFile(params, request) {
		const body = await request.json();
		const segs = norm(body.path || "");
		const dir = await dirHandle(segs.slice(0, -1), true);
		const fh = await dir.getFileHandle(segs[segs.length - 1], { create: true });
		const w = await fh.createWritable();
		const data = body.data;
		await w.write(typeof data === "string" ? new Blob([data]) : new Uint8Array(data));
		await w.close();
		return true;
	},
	async removeFile(params) {
		const segs = norm(params.get("fileName") || "");
		const s = await stat(segs);
		if (s === "directory") throw new Error("不能删除文件夹");
		if (s !== "file") throw new Error("文件不存在");
		const dir = await dirHandle(segs.slice(0, -1));
		await dir.removeEntry(segs[segs.length - 1]);
		return true;
	},
	async getFileList(params) {
		const segs = norm(params.get("dir") || "");
		const s = await stat(segs);
		if (s === "file") throw new Error("路径不是文件夹");
		if (s === null) return { folders: [], files: [] };
		const d = await dirHandle(segs);
		const folders = [];
		const files = [];
		for await (const [name, handle] of d.entries()) {
			if (name.startsWith(".") || name.startsWith("_")) continue;
			(handle.kind === "directory" ? folders : files).push(name);
		}
		return { folders, files };
	},
	async createDir(params) {
		await dirHandle(norm(params.get("dir") || ""), true);
		return true;
	},
	async removeDir(params) {
		const segs = norm(params.get("dir") || "");
		const s = await stat(segs);
		if (s === "file") throw new Error("不是文件夹");
		if (s === "directory") {
			const parent = await dirHandle(segs.slice(0, -1));
			await parent.removeEntry(segs[segs.length - 1], { recursive: true });
		}
		return true;
	},
};

// ------------------------------------------------------------------
// fetch 拦截入口
// ------------------------------------------------------------------
sw.addEventListener("fetch", event => {
	const request = event.request;
	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	const scope = sw.registration.scope; // 例如 https://user.github.io/ 或 .../noname/
	if (!request.url.startsWith(scope)) return;

	const rel = decodeURIComponent(url.pathname.slice(new URL(scope).pathname.length));

	// 1) extension/ 下的静态资源：OPFS 优先，未命中回退网络
	if (request.method === "GET" && rel.startsWith("extension/")) {
		event.respondWith(
			(async () => {
				try {
					const segs = norm(rel);
					const file = await readOpfsFile(segs);
					return new Response(file, {
						headers: {
							"Content-Type": mimeOf(segs[segs.length - 1]),
							"Cache-Control": "no-store",
						},
					});
				} catch {
					return fetch(request);
				}
			})()
		);
		return;
	}

	// 2) 文件系统 RPC 端点（仅根路径部署时会命中）
	const handler = RPC[rel];
	if (handler) {
		event.respondWith(
			handler(url.searchParams, request)
				.then(ok)
				.catch(fail)
		);
	}
});

console.log("[sw-fs] OPFS 虚拟文件系统已挂载, scope:", sw.registration?.scope);
