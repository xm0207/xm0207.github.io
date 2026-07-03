/**
 * preload.js — 无名杀网页版 OPFS 文件系统适配器
 *
 * 原理：entry.ts 启动时会优先 `import("/preload.js")`，成功则跳过默认的
 * init/browser.js 平台适配器。本文件实现与 browser.js 完全相同的 API 表面
 * （game.readFile / writeFile / createDir / getFileList 等），但后端不再是
 * packages/fs 的本地 HTTP server，而是浏览器的 OPFS
 * (Origin Private File System, navigator.storage.getDirectory())。
 *
 * 读取语义为「覆盖层」：OPFS 优先，未命中则回退到静态站点上的真实文件。
 * 写入全部落 OPFS。因此导入的扩展与游戏本体资源可以无缝混用。
 *
 * 注意：本文件必须部署在【域名根路径】(https://<user>.github.io/preload.js)，
 * 因为 entry.ts 中的导入路径是硬编码的绝对路径 "/preload.js"。
 * 若游戏部署在项目子路径（如 /noname/），把本文件放在 <user>.github.io
 * 用户站点仓库的根目录即可（同源，可被正常导入）。
 */
export default async function opfsPreload({ lib, game }) {
	// ---------------------------------------------------------------
	// 0. 环境检查
	// ---------------------------------------------------------------
	if (!navigator.storage?.getDirectory) {
		console.error("[preload] 当前浏览器不支持 OPFS，文件读写功能不可用");
		return;
	}
	const root = await navigator.storage.getDirectory();
	// 尽量申请持久化存储，降低被浏览器自动清理的概率
	navigator.storage.persist?.().catch(() => {});

	// 游戏根目录（用于网络回退），即 index.html 所在目录
	const BASE = new URL("./", location.href);

	// ---------------------------------------------------------------
	// 1. lib.path — posix 风格最小实现
	//    （browser.js 里用的是 path-browserify-esm；preload 无法依赖
	//    importmap 中的裸模块名，这里内联核心方法即可，覆盖 core 中
	//    实际用到的 join/dirname/extname/parse/format/relative/basename）
	// ---------------------------------------------------------------
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
	const miniPath = {
		sep: "/",
		join: (...parts) => norm(parts.filter(Boolean).join("/")).join("/"),
		dirname: p => {
			const segs = norm(p);
			segs.pop();
			return segs.length ? segs.join("/") : ".";
		},
		basename: (p, ext) => {
			let b = norm(p).pop() || "";
			if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length);
			return b;
		},
		extname: p => {
			const b = norm(p).pop() || "";
			const i = b.lastIndexOf(".");
			return i > 0 ? b.slice(i) : "";
		},
		parse: p => {
			const segs = norm(p);
			const base = segs.pop() || "";
			const dir = segs.join("/");
			const i = base.lastIndexOf(".");
			const ext = i > 0 ? base.slice(i) : "";
			return { root: "", dir, base, ext, name: ext ? base.slice(0, -ext.length) : base };
		},
		format: o => {
			const base = o.base || `${o.name || ""}${o.ext || ""}`;
			return o.dir ? `${o.dir}/${base}` : base;
		},
		relative: (from, to) => {
			const a = norm(from);
			const b = norm(to);
			while (a.length && b.length && a[0] === b[0]) {
				a.shift();
				b.shift();
			}
			return [...a.map(() => ".."), ...b].join("/");
		},
		normalize: p => norm(p).join("/"),
		resolve: (...parts) => "/" + norm(parts.join("/")).join("/"),
		isAbsolute: p => String(p).startsWith("/"),
	};
	lib.path = miniPath;

	// ---------------------------------------------------------------
	// 2. OPFS 工具函数
	// ---------------------------------------------------------------
	/** 获取目录句柄；create=true 时逐级创建 */
	async function dirHandle(segs, create = false) {
		let h = root;
		for (const s of segs) h = await h.getDirectoryHandle(s, { create });
		return h;
	}
	/** 路径状态: "file" | "directory" | null */
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
	const errMsg = e => (e && e.message) || String(e);

	// ---------------------------------------------------------------
	// 3. 与 browser.js 对齐的平台 API
	//    （回调签名、成功/失败分支与原实现逐一对应）
	// ---------------------------------------------------------------
	game.export = function (data, name) {
		if (typeof data === "string") {
			data = new Blob([data], { type: "text/plain" });
		}
		let fileNameToSaveAs = name || "noname";
		fileNameToSaveAs = fileNameToSaveAs.replace(/\\|\/|:|\?|"|\*|<|>|\|/g, "-");
		const a = document.createElement("a");
		a.download = fileNameToSaveAs;
		a.href = window.URL.createObjectURL(data);
		a.click();
	};

	game.exit = function () {
		window.onbeforeunload = null;
		window.close();
	};

	game.open = function (url) {
		window.open(url);
	};

	/** 回调: 1=是文件 0=是目录 -1=不存在。OPFS 未命中时回退到静态站点 HEAD 探测 */
	game.checkFile = function (fileName, callback, onerror) {
		(async () => {
			const s = await stat(norm(fileName));
			if (s === "file") return callback?.(1);
			if (s === "directory") return callback?.(0);
			try {
				const res = await fetch(new URL(norm(fileName).join("/"), BASE), { method: "HEAD" });
				callback?.(res.ok ? 1 : -1);
			} catch {
				callback?.(-1);
			}
		})().catch(onerror);
	};

	/** 回调: 1=是目录 0=是文件 -1=不存在（目录无法通过 HTTP 探测，仅查 OPFS） */
	game.checkDir = function (dir, callback, onerror) {
		(async () => {
			const s = await stat(norm(dir));
			if (s === "directory") return callback?.(1);
			if (s === "file") return callback?.(0);
			callback?.(-1);
		})().catch(onerror);
	};

	game.readFile = function (fileName, callback = () => {}, error = () => {}) {
		(async () => {
			const segs = norm(fileName);
			// OPFS 优先
			try {
				const dir = await dirHandle(segs.slice(0, -1));
				const fh = await dir.getFileHandle(segs[segs.length - 1]);
				const buf = await (await fh.getFile()).arrayBuffer();
				return callback(buf);
			} catch {}
			// 回退到静态站点
			try {
				const res = await fetch(new URL(segs.join("/"), BASE));
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				callback(await res.arrayBuffer());
			} catch (e) {
				error(errMsg(e));
			}
		})();
	};

	game.readFileAsText = function (fileName, callback = () => {}, error = () => {}) {
		(async () => {
			const segs = norm(fileName);
			try {
				const dir = await dirHandle(segs.slice(0, -1));
				const fh = await dir.getFileHandle(segs[segs.length - 1]);
				return callback(await (await fh.getFile()).text());
			} catch {}
			try {
				const res = await fetch(new URL(segs.join("/"), BASE));
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				callback(await res.text());
			} catch (e) {
				error(errMsg(e));
			}
		})();
	};

	/** 成功: callback() / 失败: callback(errorMsg) — 与 browser.js 一致 */
	game.writeFile = function (data, path, name, callback = () => {}) {
		// File / Blob 直接走 arrayBuffer，无需 FileReader
		if (Object.prototype.toString.call(data) === "[object File]" || data instanceof Blob) {
			data.arrayBuffer().then(
				buf => game.writeFile(buf, path, name, callback),
				e => callback(errMsg(e))
			);
			return;
		}
		(async () => {
			let filePath = path;
			if (path.endsWith("/") || path === "") filePath += name;
			else filePath += "/" + name;
			const segs = norm(filePath);
			const dir = await dirHandle(segs.slice(0, -1), true);
			const fh = await dir.getFileHandle(segs[segs.length - 1], { create: true });
			const w = await fh.createWritable();
			await w.write(typeof data === "string" ? new Blob([data]) : data);
			await w.close();
		})().then(
			() => callback(),
			e => callback(errMsg(e))
		);
	};

	game.removeFile = function (fileName, callback = () => {}, error = () => {}) {
		(async () => {
			const segs = norm(fileName);
			const s = await stat(segs);
			if (s === "directory") throw new Error("不能删除文件夹");
			if (s === "file") {
				const dir = await dirHandle(segs.slice(0, -1));
				await dir.removeEntry(segs[segs.length - 1]);
			}
			callback(undefined);
		})().catch(error);
	};

	/** 回调: callback(folders, files)，忽略 . 与 _ 前缀（与 fs server 一致） */
	game.getFileList = function (dir, callback = () => {}, onerror) {
		(async () => {
			const segs = norm(dir);
			const s = await stat(segs);
			if (s === "file") throw new Error("路径不是文件夹");
			if (s === null) {
				// OPFS 中不存在：返回空列表而非报错，
				// 便于 UI 首次浏览 extension 目录时不至于崩溃
				return callback([], []);
			}
			const d = await dirHandle(segs);
			const folders = [];
			const files = [];
			for await (const [name, handle] of d.entries()) {
				if (name.startsWith(".") || name.startsWith("_")) continue;
				(handle.kind === "directory" ? folders : files).push(name);
			}
			callback(folders, files);
		})().catch(e => onerror?.(e instanceof Error ? e : new Error(errMsg(e))));
	};

	game.ensureDirectory = function (list, callback = () => {}, file = false) {
		let pathArray = typeof list == "string" ? list.split("/") : list;
		if (file) pathArray = pathArray.slice(0, -1);
		game.createDir(pathArray.join("/"), callback, console.error);
	};

	game.createDir = function (directory, successCallback = () => {}, errorCallback = () => {}) {
		dirHandle(norm(directory), true).then(
			() => successCallback(),
			e => errorCallback(e instanceof Error ? e : new Error(errMsg(e)))
		);
	};

	game.removeDir = function (directory, successCallback = () => {}, errorCallback = () => {}) {
		(async () => {
			const segs = norm(directory);
			const s = await stat(segs);
			if (s === "directory") {
				const parent = await dirHandle(segs.slice(0, -1));
				await parent.removeEntry(segs[segs.length - 1], { recursive: true });
			} else if (s === "file") {
				throw new Error(`${directory} 不是文件夹`);
			}
			successCallback();
		})().catch(e => errorCallback(e instanceof Error ? e : new Error(errMsg(e))));
	};

	console.log("[preload] OPFS 文件系统适配器已加载，游戏根目录:", BASE.href);
}
