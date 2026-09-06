import { t, tp, formatWhen } from "./i18n";

export function collectInventory(catalog) {
	const rows = [];
	for (const tab of catalog ?? []) {
		for (const cat of tab.categories ?? []) {
			for (const app of cat.apps ?? []) {
				const kind = app.kind || "app";
				rows.push({
					tab: tab.name || "",
					category: cat.name || "",
					kind: kind === "embed" ? t("inventory.kindEmbed") : kind === "note" ? t("inventory.kindNote") : t("inventory.kindApp"),
					title: String(app.title || "").trim(),
					url: kind === "note" ? "" : String(app.url || "").trim(),
					extras: ((app.links ?? []).map((l) => l.url).filter(Boolean)).join(" | "),
					tags: (app.tags ?? []).join(", ")
				});
			}
		}
	}
	return rows;
}

function csvCell(value) {
	return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function inventoryCsv(rows) {
	const header = [t("inventory.space"), t("inventory.category"), t("inventory.type"), t("inventory.title"), t("inventory.link"), t("inventory.otherLinks"), t("inventory.tags")];
	const lines = [header.map(csvCell).join(";")];
	for (const r of rows) {
		lines.push([r.tab, r.category, r.kind, r.title, r.url, r.extras, r.tags].map(csvCell).join(";"));
	}
	return `\uFEFF${lines.join("\r\n")}`;
}

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 32;
const COLS = [78, 78, 52, 108, 248, 128, 78];
function inventoryHead() {
	return [t("inventory.space"), t("inventory.category"), t("inventory.type"), t("inventory.title"), t("inventory.link"), t("inventory.otherLinks"), t("inventory.tags")];
}
const CHAR_W = 3.9;
const LINE_H = 11;

function pdfStr(value) {
	let out = "";
	for (const ch of String(value ?? "")) {
		const c = ch.codePointAt(0) ?? 32;
		if (ch === "\\" || ch === "(" || ch === ")") {
			out += `\\${ch}`;
			continue;
		}
		if (c === 0x2014 || c === 0x2013) {
			out += "-";
			continue;
		}
		if (c === 0x2019 || c === 0x2018) {
			out += "'";
			continue;
		}
		if (c >= 32 && c <= 126) {
			out += ch;
			continue;
		}
		if (c >= 160 && c <= 255) {
			out += `\\${c.toString(8).padStart(3, "0")}`;
			continue;
		}
		out += "?";
	}
	return `(${out})`;
}

function wrapCell(text, width) {
	const raw = String(text ?? "").trim() || "-";
	const max = Math.max(4, Math.floor(width / CHAR_W));
	const lines = [];
	let rest = raw;
	while (rest.length) {
		if (rest.length <= max) {
			lines.push(rest);
			break;
		}
		const space = rest.lastIndexOf(" ", max);
		const cut = space > 0 ? space : max;
		lines.push(rest.slice(0, cut).trim());
		rest = rest.slice(cut).trim();
		if (lines.length >= 8) {
			if (rest) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, max - 3))}...`;
			break;
		}
	}
	return lines;
}

function pageStream(title, meta, rows, startY) {
	const chunks = [
		"BT",
		"/F2 14 Tf",
		`1 0 0 1 ${MARGIN} ${PAGE_H - 28} Tm`,
		`${pdfStr(title)} Tj`,
		"/F1 8 Tf",
		`0 -14 Td`,
		`${pdfStr(meta)} Tj`,
		"ET",
	];
	let y = startY;
	const drawRow = (cells, bold) => {
		const wrapped = cells.map((cell, i) => wrapCell(cell, COLS[i] - 6));
		const h = Math.max(1, ...wrapped.map((w) => w.length)) * LINE_H + 4;
		if (y - h < MARGIN) return false;
		let x = MARGIN;
		for (let i = 0; i < COLS.length; i++) {
			const lines = wrapped[i];
			let ly = y - 10;
			for (const line of lines) {
				chunks.push("BT", bold ? "/F2 7 Tf" : "/F1 7 Tf", `1 0 0 1 ${x + 3} ${ly} Tm`, `${pdfStr(line)} Tj`, "ET");
				ly -= LINE_H;
			}
			x += COLS[i];
		}
		y -= h;
		return true;
	};
	drawRow(inventoryHead(), true);
	for (const row of rows) {
		const ok = drawRow([row.tab, row.category, row.kind, row.title, row.url, row.extras, row.tags], false);
		if (!ok) return { content: chunks.join("\n"), rest: rows.slice(rows.indexOf(row)), y };
	}
	return { content: chunks.join("\n"), rest: [], y };
}

export function inventoryPdf(rows, portalTitle) {
	const title = `${portalTitle || "Dockit"} - ${t("inventory.titleSuffix")}`;
	const stamp = formatWhen(new Date(), true);
	const meta = `${tp("inventory.entries", rows.length)} - ${stamp}`;
	const list = rows.length ? rows : [{ tab: "-", category: "-", kind: "-", title: t("inventory.noCards"), url: "", extras: "", tags: "" }];
	const pages = [];
	let rest = list;
	while (rest.length) {
		const drawn = pageStream(title, meta, rest, PAGE_H - 52);
		pages.push(drawn.content);
		rest = drawn.rest;
		if (pages.length > 80) break;
	}
	const objs = [];
	const add = (body) => {
		objs.push(body);
		return objs.length;
	};
	const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
	const fontB = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
	const contentIds = pages.map((stream) => add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
	const pagePlaceholders = contentIds.map(() => add("<< >>"));
	const pagesId = add(`<< /Type /Pages /Kids [${pagePlaceholders.map((id) => `${id} 0 R`).join(" ")}] /Count ${pagePlaceholders.length} >>`);
	for (let i = 0; i < pagePlaceholders.length; i++) {
		objs[pagePlaceholders[i] - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> >>`;
	}
	const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
	let out = "%PDF-1.4\n";
	const xref = [0];
	for (let i = 0; i < objs.length; i++) {
		xref.push(out.length);
		out += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
	}
	const startxref = out.length;
	out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
	for (let i = 1; i < xref.length; i++) out += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
	out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${startxref}\n%%EOF`;
	const bytes = new Uint8Array(out.length);
	for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
	return bytes;
}
