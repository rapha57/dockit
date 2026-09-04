import fs from "node:fs";
import { parse } from "@babel/parser";
import _generate from "@babel/generator";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";

const generate = _generate.default ?? _generate;
const traverse = _traverse.default ?? _traverse;

const file = process.argv[2];
if (!file) {
	console.error("usage: node scripts/jsx-runtime-to-jsx.mjs <file>");
	process.exit(1);
}

function isJsxCall(node) {
	return t.isCallExpression(node) && t.isIdentifier(node.callee) && (node.callee.name === "jsx" || node.callee.name === "jsxs");
}

function jsxName(typeNode) {
	if (t.isStringLiteral(typeNode)) return t.jsxIdentifier(typeNode.value);
	if (t.isIdentifier(typeNode)) return t.jsxIdentifier(typeNode.name);
	if (t.isMemberExpression(typeNode) && !typeNode.computed && t.isIdentifier(typeNode.property)) {
		const obj = t.isIdentifier(typeNode.object)
			? t.jsxIdentifier(typeNode.object.name)
			: jsxName(typeNode.object);
		return t.jsxMemberExpression(obj, t.jsxIdentifier(typeNode.property.name));
	}
	throw new Error(`unsupported JSX type: ${typeNode.type}`);
}

function toJsxChild(node) {
	if (!node || t.isNullLiteral(node) || (t.isIdentifier(node) && node.name === "undefined")) return null;
	if (t.isJSXElement(node) || t.isJSXFragment(node)) return node;
	if (t.isStringLiteral(node)) {
		if (node.value === "") return null;
		if (/[{}<>]/.test(node.value)) return t.jsxExpressionContainer(node);
		return t.jsxText(node.value);
	}
	return t.jsxExpressionContainer(node);
}

function callToJsx(node) {
	const typeArg = node.arguments[0];
	const propsArg = node.arguments[1];
	const keyArg = node.arguments[2];

	if (t.isIdentifier(typeArg) && typeArg.name === "Fragment") {
		const kids = childrenOf(propsArg);
		return t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), kids);
	}

	const attrs = [];
	if (keyArg) attrs.push(t.jsxAttribute(t.jsxIdentifier("key"), t.jsxExpressionContainer(keyArg)));

	let childrenNode = null;
	if (t.isObjectExpression(propsArg)) {
		for (const prop of propsArg.properties) {
			if (t.isSpreadElement(prop)) {
				attrs.push(t.jsxSpreadAttribute(prop.argument));
				continue;
			}
			if (!t.isObjectProperty(prop) || prop.computed) continue;
			const name = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
			if (!name) continue;
			if (name === "children") {
				childrenNode = prop.value;
				continue;
			}
			const id = t.jsxIdentifier(name);
			const val = prop.value;
			if (t.isBooleanLiteral(val) && val.value === true) attrs.push(t.jsxAttribute(id, null));
			else if (t.isStringLiteral(val)) attrs.push(t.jsxAttribute(id, val));
			else attrs.push(t.jsxAttribute(id, t.jsxExpressionContainer(val)));
		}
	} else if (propsArg && !t.isNullLiteral(propsArg)) {
		attrs.push(t.jsxSpreadAttribute(propsArg));
	}

	const name = jsxName(typeArg);
	const kids = unpackChildren(childrenNode);
	if (!kids.length) {
		return t.jsxElement(t.jsxOpeningElement(name, attrs, true), null, [], true);
	}
	return t.jsxElement(t.jsxOpeningElement(name, attrs, false), t.jsxClosingElement(name), kids, false);
}

function childrenOf(propsArg) {
	if (!t.isObjectExpression(propsArg)) return [];
	const ch = propsArg.properties.find((p) => t.isObjectProperty(p) && !p.computed && (p.key.name === "children" || p.key.value === "children"));
	return ch ? unpackChildren(ch.value) : [];
}

function unpackChildren(childrenNode) {
	if (!childrenNode) return [];
	if (t.isArrayExpression(childrenNode)) {
		return childrenNode.elements.filter(Boolean).map(toJsxChild).filter(Boolean);
	}
	const c = toJsxChild(childrenNode);
	return c ? [c] : [];
}

const source = fs.readFileSync(file, "utf8");
const ast = parse(source, {
	sourceType: "module",
	plugins: ["jsx", "typescript"],
	errorRecovery: true,
});

let converted = 0;
traverse(ast, {
	CallExpression: {
		exit(path) {
			if (!isJsxCall(path.node)) return;
			try {
				path.replaceWith(callToJsx(path.node));
				converted += 1;
			} catch (err) {
				console.warn("skip", err.message);
			}
		},
	},
});

traverse(ast, {
	ImportDeclaration(path) {
		if (path.node.source.value !== "react/jsx-runtime") return;
		path.remove();
	},
});

const out = generate(ast, {
	jsescOption: { minimal: true },
	retainLines: false,
	compact: false,
	comments: true,
}).code;

fs.writeFileSync(file, out);
console.log(`converted ${converted} jsx() calls in ${file}`);
