#!/usr/bin/env node
/**
 * fix-paths.mjs — GitHub Pages 路径修复脚本
 *
 * Jekyll 会跳过以 _ 或 . 开头的文件/目录。本脚本在构建后执行：
 * 1. _virtual/ -> virtual/，内部 _* 文件重命名
 * 2. node_modules/.pnpm/*/node_modules/PKG -> deps/PKG
 * 3. 全量替换所有 JS/HTML 文件中的路径引用
 */
import fs from "fs";
import path from "path";

const DIST = process.argv[2] || "dist";

// ── 1. Rename _virtual/ -> virtual/ ──────────────────────────────
const vOld = path.join(DIST, "_virtual");
const vNew = path.join(DIST, "virtual");
if (fs.existsSync(vOld)) {
	fs.renameSync(vOld, vNew);
	console.log("  _virtual/ -> virtual/");
}

// Rename _-prefixed files inside virtual/
const renamedFiles = new Map(); // old basename -> new basename
if (fs.existsSync(vNew)) {
	for (const f of fs.readdirSync(vNew)) {
		if (f.startsWith("_")) {
			const newName = "vt-" + f.replace(/^_+/, "");
			fs.renameSync(path.join(vNew, f), path.join(vNew, newName));
			renamedFiles.set(f, newName);
			console.log(`  virtual/${f} -> virtual/${newName}`);
		}
	}
}

// ── 2. Flatten node_modules/.pnpm -> deps/ ──────────────────────
const nm = path.join(DIST, "node_modules");
const deps = path.join(DIST, "deps");
if (fs.existsSync(nm)) {
	fs.mkdirSync(deps, { recursive: true });
	const pnpm = path.join(nm, ".pnpm");
	if (fs.existsSync(pnpm)) {
		for (const verDir of fs.readdirSync(pnpm)) {
			const innerNm = path.join(pnpm, verDir, "node_modules");
			if (!fs.existsSync(innerNm)) continue;
			for (const pkg of fs.readdirSync(innerNm)) {
				const src = path.join(innerNm, pkg);
				const dst = path.join(deps, pkg);
				if (!fs.existsSync(dst) && fs.statSync(src).isDirectory()) {
					fs.cpSync(src, dst, { recursive: true });
				}
			}
		}
	}
	fs.rmSync(nm, { recursive: true, force: true });
	console.log("  node_modules/ -> deps/ (flattened)");
}

// ── 3. Build replacement rules ──────────────────────────────────
// Rule: node_modules/.pnpm/<anything>/node_modules/ -> deps/
// Handles both absolute (/node_modules/...) and relative (../node_modules/...) paths
const PNPM_RE = /(?:\.\.\/)*(?:\.\/)?node_modules\/\.pnpm\/[^/]+\/node_modules\//g;
const PNPM_REPLACE = (match) => {
	// Count leading ../
	const ups = (match.match(/\.\.\//g) || []).length;
	if (ups > 0) return "../".repeat(ups) + "deps/";
	if (match.startsWith("./")) return "./deps/";
	return "deps/";
};

// Rule: _virtual/ -> virtual/
const VIRTUAL_DIR_RE = /_virtual\//g;

// Rule: "_virtual" (quoted) -> "virtual"
const VIRTUAL_QUOTED_RE = /"_virtual"/g;

// Rule: virtual/_+<name> -> virtual/vt-<name>  (for renamed files)
function replaceVirtualUnderscoreFiles(content) {
	// Match virtual/<underscores><rest> where underscores is one or more _
	return content.replace(/virtual\/_+/g, "virtual/vt-");
}

// Rule: Fix cross-references inside deps/ — ../.pnpm/<ver>/node_modules/ -> just relative
const DEPS_INTERNAL_RE = /(?:\.\.\/)+\.pnpm\/[^/]+\/node_modules\//g;
const DEPS_INTERNAL_REPLACE = "";

// ── 4. Walk and replace ─────────────────────────────────────────
function walkFiles(dir, exts) {
	const results = [];
	if (!fs.existsSync(dir)) return results;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkFiles(full, exts));
		} else if (exts.some(e => entry.name.endsWith(e))) {
			results.push(full);
		}
	}
	return results;
}

const files = walkFiles(DIST, [".js", ".html", ".mjs"]);
let totalReplaced = 0;

for (const file of files) {
	let content;
	try {
		content = fs.readFileSync(file, "utf8");
	} catch {
		continue;
	}

	const original = content;

	// Apply all replacements
	content = content.replace(PNPM_RE, PNPM_REPLACE);
	content = content.replace(VIRTUAL_DIR_RE, "virtual/");
	content = content.replace(VIRTUAL_QUOTED_RE, '"virtual"');
	content = replaceVirtualUnderscoreFiles(content);

	// For files inside deps/, also fix internal cross-references
	if (file.includes("/deps/")) {
		content = content.replace(DEPS_INTERNAL_RE, DEPS_INTERNAL_REPLACE);
	}

	if (content !== original) {
		fs.writeFileSync(file, content);
		totalReplaced++;
	}
}

console.log(`  Rewrote paths in ${totalReplaced} files (scanned ${files.length} total)`);
