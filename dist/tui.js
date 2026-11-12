import { createComponent as e, createElement as t, createTextNode as n, effect as r, insert as i, insertNode as a, memo as o, setProp as s, use as c, useTerminalDimensions as l } from "@opentui/solid";
import { Plugin as u } from "@opencode/plugin/tui";
import { For as d, Show as f, createEffect as p, createSignal as m, on as h, onCleanup as g, onMount as _ } from "solid-js";
import { Rpc as v } from "@opencode/plugin/rpc";
// src/types.ts
function y(e) {
	if (!e || typeof e != "object" || !("status" in e) || !("findings" in e) || !Array.isArray(e.findings)) throw Error("Invalid security state");
	return e;
}
// src/scan-display.ts
var b = (e) => e.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || e || "Project";
function x(e) {
	return e.plan?.scanPrompt?.split("\n")[0].slice(0, 72) || (e.plan?.scopePaths.length ? e.plan.scopePaths.join(", ") : b(e.repository));
}
function S(e) {
	return e.changes ? e.changes === "uncommitted" ? "Uncommitted changes" : `Changes since ${e.changes}` : e.scopePaths.join(", ") || "Whole repository";
}
function C(e) {
	return e.plan ? S(e.plan) : "Whole repository";
}
function w(e) {
	let t = e.replace(/\s*\((files|reviews)\)$/, "").replaceAll("_", " "), n = {
		preflight: "Preparing scan",
		discovery: "Reviewing source",
		"attack path": "Reviewing attack paths",
		"file review": "Reviewing source",
		ranking: "Prioritizing findings",
		validation: "Validating findings",
		reporting: "Preparing report"
	};
	return n[t] ? n[t] : t ? t[0].toUpperCase() + t.slice(1) : "Starting scan";
}
function T(e) {
	let t = e.telemetry?.phaseProgress, n = t ? t.reviews && t.reviews.total > 0 ? {
		...t.reviews,
		unit: "reviews"
	} : {
		...t.files,
		unit: "files"
	} : {
		...e.progress,
		unit: e.progress.unit ?? "files"
	};
	return {
		...n,
		done: Number.isFinite(n.done) ? Math.max(0, n.done) : 0,
		total: Number.isFinite(n.total) ? Math.max(0, n.total) : 0
	};
}
function E(e) {
	return e.status === "running" && e.telemetry?.lifecycle?.status === "completed";
}
function D(e) {
	let t = e.telemetry?.lifecycle?.status;
	return e.status === "running" && t !== void 0 && t !== "running";
}
function ee(e) {
	return e.status === "cancelled" ? "Scan cancelled" : e.status === "error" ? "Scan stopped" : e.status === "completed" ? "Scan complete" : E(e) ? "Finalizing results" : D(e) ? e.telemetry?.lifecycle?.status === "failed" ? "Finishing failed scan" : "Finishing cancelled scan" : e.deepProgress?.consolidating ? "Consolidating deep review" : w(e.telemetry?.phaseProgress?.phase ?? e.phase);
}
function te(e) {
	return e.status === "running" && !D(e) && !e.deepProgress?.consolidating;
}
function O(e) {
	let { done: t, total: n, unit: r } = T(e);
	return n > 0 ? `${t} of ${n} ${r}` : t > 0 ? `${t} ${r} completed` : "Waiting for progress details";
}
function ne(e) {
	let t = e.deepProgress;
	return t ? `${t.completed} deep ${t.completed === 1 ? "pass" : "passes"} complete · ${t.active} active · cap ${t.maximum}` : "";
}
function k(e) {
	return D(e) && !E(e) ? `The SDK reported ${e.telemetry?.lifecycle?.status === "failed" ? "a scan failure" : "cancellation"}. Waiting for the final result; this is not a completed assessment.` : E(e) ? "Analysis complete. Waiting for the SDK’s final result and findings." : "Findings will appear when the scan finishes.";
}
var A = (e) => e > 0 && e < .01 ? "<0.01" : e.toFixed(2);
function j(e) {
	let t = e.telemetry?.measurement;
	if (t) {
		let e = t.cost;
		if (!e || !Number.isFinite(e.baselineUsd)) return "Cost estimate unavailable";
		let n = `USD ${A(e.baselineUsd)}`;
		return t.coverage === "partial" ? `Partial estimate ${n}` : t.coverage === "unavailable" ? `Last estimate ${n} · coverage unavailable` : `Estimated usage ${n}`;
	}
	return e.estimatedCostUsd !== void 0 && Number.isFinite(e.estimatedCostUsd) ? `Estimated usage USD ${A(e.estimatedCostUsd)} · coverage unknown` : "Cost estimate unavailable";
}
function M(e) {
	let t = e.telemetry?.measurement;
	if (!t) return "Usage coverage was not reported. Estimates are not invoices.";
	let n = t.missingThreadCount;
	return t.coverage === "partial" ? `Measured subtotal only${n ? `; ${n} ${n === 1 ? "session is" : "sessions are"} missing` : ""}. The full estimate may be higher.` : t.coverage === "unavailable" ? "The SDK could not establish usage coverage." : "All reported sessions are included. This is a usage estimate, not an invoice.";
}
function N(e) {
	return [...e.telemetry?.activity ?? []].sort((e, t) => t.updatedAt.localeCompare(e.updatedAt));
}
function P(e) {
	let t = /* @__PURE__ */ new Set();
	return N(e).filter((e) => {
		let n = e.worker ?? "coordinator";
		return !t.has(n) && (t.add(n), !0);
	});
}
function re(e) {
	return e === void 0 ? "Coordinator" : `Worker ${e}`;
}
function ie(e, t) {
	return e === "running" && (t.status !== "running" || D(t) || t.deepProgress?.consolidating) ? "Last reported running" : e === "running" ? "Working" : e === "failed" ? "Failed" : "Done";
}
function F(e) {
	let t = e.telemetry?.observedWorkers.length;
	return t ? `${t} worker ${t === 1 ? "session" : "sessions"} observed` : "";
}
function I(e) {
	let t = e.workers;
	return t ? `${w(t.phase)}: ${t.started} started · ${t.planned} planned` : "";
}
function L(e) {
	let t = e.telemetry?.trustedAccess;
	return t === "not_granted" ? "Trusted Access for Cyber: not granted" : t === "unknown" ? "Trusted Access for Cyber: not verified" : "";
}
function R(e) {
	return e.telemetry?.warnings?.targetChanged ? "The repository changed during the scan" : "";
}
function ae(e) {
	let t = e.assessment?.returnedFindings;
	return t ? t.total === null ? "Returned finding counts unavailable" : [
		`${t.reportable ?? "Unknown"} reportable`,
		`${t.informational ?? "Unknown"} informational`,
		...t.unclassified ? [`${t.unclassified} unclassified`] : []
	].join(" · ") : `${e.findings.length} ${e.findings.length === 1 ? "finding" : "findings"} shown${e.skipped ? ` · ${e.skipped} other items omitted` : ""}`;
}
function oe(e) {
	let t = e.assessment?.coverage;
	return !t || t.source === "unavailable" ? "Coverage details unavailable" : [
		t.surfaces.total === null ? "Surfaces unavailable" : `${t.surfaces.total} review ${t.surfaces.total === 1 ? "surface" : "surfaces"}`,
		t.deferred.total === null ? "Deferred work unavailable" : `${t.deferred.total} deferred`,
		t.openQuestions.total === null ? "Open questions unavailable" : `${t.openQuestions.total} open ${t.openQuestions.total === 1 ? "question" : "questions"}`
	].join(" · ");
}
function z(e) {
	let t = e.assessment?.repositoryFindings;
	return t?.available ? `${t.open ?? "Unknown"} open · ${t.closed ?? "Unknown"} closed · ${t.confirmedInLatestScan ?? "Unknown"} confirmed in this scan` : "Repository matching unavailable";
}
function B(e, t, n = Date.now()) {
	if (!e) return "";
	let r = Math.max(0, Math.floor(((t ? Date.parse(t) : n) - Date.parse(e)) / 1e3));
	return Number.isFinite(r) ? r < 60 ? `${r}s` : r < 3600 ? `${Math.floor(r / 60)}m ${r % 60}s` : `${Math.floor(r / 3600)}h ${Math.floor(r % 3600 / 60)}m` : "";
}
function V(e) {
	return e && typeof e == "object" && "message" in e ? String(e.message) : String(e);
}
function se(e) {
	return `${e.title}\nSeverity: ${e.severity} · ${e.cwe}\nLocation: ${e.path}:${e.line}\n\n${e.summary}\n\nEvidence:\n${e.evidence}\n\nSuggested remediation:\n${e.remediation}`;
}
function ce(e) {
	let t = (e) => (e?.match(/\d+/g) ?? []).map(Number), [n = 0, r = 0] = t(e.node), [i = 0, a = 0] = t(e.python), o = (e) => e ? `found ${e}` : "not found";
	return [...n === 24 || n === 26 || n === 22 && r >= 13 ? [] : [`Node 22.13 or newer (${o(e.node)})`], ...i > 3 || i === 3 && a >= 10 ? [] : [`Python 3.10 or newer (${o(e.python)})`]];
}
function le(e) {
	return {
		verified: "Fix verified",
		no_change: "No change needed",
		blocked: "Fix blocked",
		failed: "Fix failed verification"
	}[e] ?? "Fix";
}
function H(e) {
	if (!e) return "";
	if (e.pending) return e.pending.code ? `Enter code ${e.pending.code} at ${e.pending.url}` : `Finish signing in in your browser: ${e.pending.url}`;
	let t = {
		"signed-in": "",
		shared: "Using your Codex CLI sign-in; sign in here to keep the two separate",
		needed: "Not signed in to Codex Security"
	}[e.state];
	return [e.error, t].filter(Boolean).join(" · ");
}
var U = [
	"critical",
	"high",
	"medium",
	"low"
];
function ue(e) {
	return [...e.findings].sort((e, t) => U.indexOf(e.severity) - U.indexOf(t.severity));
}
function W(e) {
	return U.map((t) => [t, e.findings.filter((e) => e.severity === t).length]).filter(([, e]) => e).map(([e, t]) => `${t} ${e}`).join(" · ");
}
function de(e, t) {
	let n = e.reviews?.[t];
	if (n?.fix?.resolution === "applied") return {
		label: "Fix applied",
		tone: "good"
	};
	if (n?.fix?.resolution === "pending") return {
		label: "Fix ready",
		tone: "warn"
	};
	let r = n?.validation?.disposition;
	if (r === "reportable") return {
		label: "Confirmed",
		tone: "warn"
	};
	if (r === "suppressed" || r === "not_applicable") return {
		label: "Dismissed",
		tone: "muted"
	};
	if (r === "deferred") return {
		label: "Unclear",
		tone: "muted"
	};
}
function G(e) {
	return e.split("\n").map((e) => ({
		text: e,
		kind: e.startsWith("+++") || e.startsWith("---") || e.startsWith("diff ") ? "meta" : e.startsWith("@@") ? "hunk" : e.startsWith("+") ? "add" : e.startsWith("-") ? "del" : "context"
	}));
}
function fe(e) {
	return {
		reportable: "Confirmed in source",
		suppressed: "Not confirmed",
		not_applicable: "Not applicable",
		deferred: "Undecided: needs more context"
	}[e] ?? e.replaceAll("_", " ");
}
// src/plan-view.ts
function pe(e) {
	return e === void 0 ? "No cost limit is configured." : `Stops at an estimated USD ${e}. This is an estimate, not a billing cap.`;
}
function K(e) {
	let { provider: t, baseUrl: n, auth: r, model: i, reasoningEffort: a } = e.codex;
	return `${t}${n ? ` (${n})` : ""} · ${i}, ${a} reasoning · ${r}`;
}
function q(e) {
	return [
		...e.mock ? ["MOCK SDK TEST: no model calls or uploads."] : [],
		`Repository: ${e.repository}`,
		`Scope: ${S(e)}`,
		`Mode: ${e.settings.scan.mode}`,
		...e.scanPrompt ? [`Instructions: ${e.scanPrompt}`] : [],
		...e.contextFiles.length ? [`Context: ${e.contextFiles.map((e) => e.path).join(", ")}`] : [],
		`Sent to: ${K(e.settings)}`,
		pe(e.settings.scan.maxCostUsd)
	].join("\n");
}
function me(e) {
	return !!e && (e.startsWith("/") || /^[A-Za-z]:[\\/]/.test(e));
}
// src/tui/text.ts
function J(e) {
	let { route: t, profile: n, runtime: r } = e, i = [
		t.provider,
		`${t.model} (${t.reasoningEffort})`,
		t.auth,
		...n ? [`profile ${n}`] : []
	].join(" · "), a = ce(r), o = e.signIn && (e.signIn.state === "needed" || e.signIn.pending || e.signIn.error) ? H(e.signIn) : "";
	return {
		text: i,
		warnings: [...a.map((e) => `Scans need ${e}`), ...o ? [o] : []]
	};
}
function he(e) {
	return e === void 0 ? "No cost limit set. Usage shown is an estimate." : `Stops near USD ${e} (estimated; in-flight work can go over).`;
}
function ge(e) {
	return e.status === "running" ? "Running" : e.status === "completed" ? "Done" : e.status === "cancelled" ? "Cancelled" : e.status === "error" ? "Failed" : "Idle";
}
function _e(e, t) {
	let n = [
		ge(e),
		b(e.repository),
		C(e),
		e.mode ?? "standard"
	];
	return e.status === "running" ? n.push(B(e.startedAt, null, t)) : e.status === "completed" && n.push(`${e.findings.length} ${e.findings.length === 1 ? "finding" : "findings"}`), n.filter(Boolean).join(" · ");
}
function ve(e) {
	return {
		policy: "Policy draft",
		validation: "Validation",
		fix: "Fix"
	}[e.kind];
}
function ye(e) {
	return [
		ve(e),
		w(e.status),
		b(e.repository),
		...e.kind === "policy" && e.plan.path ? [e.plan.path] : []
	].join(" · ");
}
var be = (e) => !!e && [
	"prepared",
	"running",
	"awaiting_answers"
].includes(e.status);
function xe(e, t) {
	let n = e.replace(/\s+/g, " ");
	return n.length <= t ? n : n.slice(0, Math.max(0, t - 1)) + "…";
}
function Se(e, t, n) {
	let r = Math.max(0, Math.min(t - Math.floor(n / 2), e.length - n));
	return {
		start: r,
		items: e.slice(r, r + n)
	};
}
function Ce(e) {
	return e.split(/[,\n]/).map((e) => e.trim()).filter(Boolean);
}
// src/security-tui-operations.tsx
function we(e, t, n, r) {
	let { client: i, location: a } = t, o = async (n) => {
		let r = n.plan, o = n.kind === "policy" ? `Component: ${r.path ?? "."}` : `Finding: ${(r.finding ?? "").split("\n")[0]}`, s = r.mock ? "Mock SDK responses; no model calls." : `Sends source${n.kind === "policy" ? "" : ", the finding"} and context to ${K(r.settings)}.`, c = n.kind === "policy" ? he(r.settings.scan.maxCostUsd) : r.costNotice, l = {
			policy: "Produces a draft for you to review; no files are written.",
			validation: "Reads source only; nothing is executed or patched.",
			fix: "Writes the fix in a copy of the last commit. Your files change only if you apply the diff."
		}[n.kind];
		await e.ui.dialog.confirm({
			title: {
				policy: "Draft a policy",
				validation: "Validate a finding",
				fix: "Propose a fix"
			}[n.kind],
			message: [
				`Repository: ${n.repository}`,
				o,
				"",
				s,
				c,
				l
			].join("\n"),
			label: {
				confirm: "Start",
				cancel: "Back"
			}
		}) && !t.isDisposed() && (await i.operationStart({ operationId: n.operationId }, { location: a }), await t.refreshOperations());
	}, s = async (e) => {
		let n = await i.operationPrepare(e, { location: a });
		await t.refreshOperations(), e.source || r(n.operationId), await o(n);
	}, c = (e, t) => ({
		repository: e.repository,
		finding: se(t),
		source: {
			runId: e.runId,
			findingId: t.id
		}
	});
	return {
		draftPolicy: () => t.perform(async () => {
			let t = await n();
			if (!t) return;
			let r = await e.ui.dialog.prompt({
				title: "Draft a policy",
				description: `Directory in ${t} to cover. Leave empty for the whole project.`,
				placeholder: "src/api"
			});
			r !== void 0 && await s({
				kind: "policy",
				repository: t,
				...r.trim() ? { path: r.trim() } : {}
			});
		}),
		validate: (e, n) => t.perform(() => s({
			kind: "validation",
			...c(e, n)
		})),
		validateText: () => t.perform(async () => {
			let t = await n();
			if (!t) return;
			let r = await e.ui.dialog.prompt({
				title: "Validate a finding",
				description: `Describe the suspected issue in ${t}: location and evidence. Leave out secrets.`
			});
			r?.trim() && await s({
				kind: "validation",
				repository: t,
				finding: r
			});
		}),
		fix: (e, n) => t.perform(() => s({
			kind: "fix",
			...c(e, n)
		})),
		resolve: (n, r) => t.perform(async () => {
			(r !== "apply" || await e.ui.dialog.confirm({
				title: "Apply this fix",
				message: `Applies the diff to ${n.repository}. Nothing is committed.`,
				label: {
					confirm: "Apply",
					cancel: "Back"
				}
			}) && !t.isDisposed()) && (await i.operationResolve({
				operationId: n.operationId,
				action: r
			}, { location: a }), await t.refreshOperations());
		}),
		start: (e) => t.perform(() => o(e)),
		answer: (n) => t.perform(async () => {
			let r = n.question;
			if (!r) return;
			let o = await e.ui.dialog.prompt({
				title: "Answer policy questions",
				description: r.questions.map((e, t) => `${t + 1}. ${e}`).join("\n") + "\n\nAnswer each one, or say what you do not know. Leave out secrets."
			});
			o?.trim() && (await i.operationAnswer({
				operationId: n.operationId,
				questionId: r.id,
				answer: o
			}, { location: a }), await t.refreshOperations());
		}),
		cancel: (e) => t.perform(async () => {
			await i.operationCancel({ operationId: e.operationId }, { location: a }), await t.refreshOperations();
		})
	};
}
// src/tui/review.tsx
var Te = {
	default: "standard",
	standard: "deep",
	deep: "default"
}, Ee = (e) => ({
	...e.inputs,
	repository: e.repository
});
function De(e, t) {
	let { mode: n, ...r } = e;
	return t === "default" ? r : {
		...r,
		mode: t
	};
}
async function Oe(t, n, r, i) {
	let [a, o] = m(i), [s, c] = m(""), [l, u] = m(!1), [d, f] = m(!1), p = async (e) => {
		u(!0), c("");
		try {
			o(await r(e));
		} catch (e) {
			c(V(e));
		} finally {
			u(!1);
		}
	}, h = () => {
		let e = a().inputs.mode ?? "default";
		p(De(Ee(a()), Te[e]));
	}, g = () => new Promise((r) => {
		let i = !1, o = (e) => {
			i || (i = !0, r(e));
		};
		t.ui.dialog.show(() => e(je, {
			ctx: t,
			color: n,
			get plan() {
				return a();
			},
			get error() {
				return s();
			},
			get preparing() {
				return l();
			},
			get settings() {
				return d();
			},
			onDepth: h,
			onSettings: () => f((e) => !e),
			onAction: o
		}), () => o("back")), t.ui.dialog.set({ size: "xlarge" });
	});
	for (;;) {
		let e = await g();
		if (e === "back") return;
		if (e === "start") return t.ui.dialog.clear(), a();
		try {
			let n = await ke(t, e, a());
			n && await p(n);
		} catch (e) {
			c(V(e));
		}
	}
}
async function ke(e, t, n) {
	let r = Ee(n);
	if (t === "target") {
		let t = await e.ui.dialog.prompt({
			title: "Target repository",
			description: "Absolute path to a local repository.",
			value: n.repository,
			placeholder: "/path/to/project"
		});
		return t === void 0 || t.trim() === n.repository ? void 0 : {
			repository: Ae(t.trim()),
			...r.mode ? { mode: r.mode } : {},
			...r.scanPrompt ? { scanPrompt: r.scanPrompt } : {}
		};
	}
	if (t === "scope") {
		let { scopePaths: t, changes: i, ...a } = r, o = await e.ui.dialog.select({
			title: "What to scan",
			current: n.changes ? n.changes === "uncommitted" ? "uncommitted" : "since" : n.scopePaths.length ? "paths" : "repository",
			options: [
				{
					title: "Whole repository",
					value: "repository"
				},
				{
					title: "Selected paths",
					description: "Choose folders or files.",
					value: "paths"
				},
				{
					title: "Uncommitted changes",
					description: "Staged and unstaged work. Standard depth.",
					value: "uncommitted"
				},
				{
					title: "Changes since a branch or commit",
					description: "What changed between a ref and HEAD. Standard depth.",
					value: "since"
				}
			]
		});
		if (o === void 0) return;
		if (o === "repository") return a;
		if (o === "uncommitted") return {
			...a,
			changes: "uncommitted"
		};
		let s = await e.ui.dialog.prompt(o === "paths" ? {
			title: "Paths",
			description: "Relative to the repository, separated by commas.",
			value: n.scopePaths.join(", "),
			placeholder: "src/api, src/auth"
		} : {
			title: "Compare with",
			description: "A branch, tag or commit. The scan covers what changed since then.",
			value: n.changes && n.changes !== "uncommitted" ? n.changes : "",
			placeholder: "origin/main"
		});
		return s?.trim() ? o === "paths" ? {
			...a,
			scopePaths: Ce(s)
		} : {
			...a,
			changes: s.trim()
		} : void 0;
	}
	if (t === "focus") {
		let t = await e.ui.dialog.prompt({
			title: "Focus",
			description: "What the scan should concentrate on, and any threat assumptions.",
			value: n.scanPrompt,
			placeholder: "Tenant isolation in the billing API"
		});
		if (t === void 0) return;
		let { scanPrompt: i, ...a } = r;
		return t.trim() ? {
			...a,
			scanPrompt: t.trim()
		} : a;
	}
	let i = await e.ui.dialog.prompt({
		title: "Context files",
		description: "Repository-relative docs to include, separated by commas.",
		value: n.contextFiles.map((e) => e.path).join(", "),
		placeholder: "docs/threat-model.md"
	});
	return i === void 0 ? void 0 : {
		...r,
		contextFiles: Ce(i)
	};
}
function Ae(e) {
	if (!me(e)) throw Error("Use an absolute repository path.");
	return e;
}
function je(o) {
	let c = () => !o.preparing;
	o.ctx.keymap.layer(() => ({
		mode: "modal",
		priority: 100,
		commands: [
			{
				bind: "y",
				title: "Start scan",
				enabled: c,
				run: () => o.onAction("start")
			},
			{
				bind: "t",
				title: "Change target",
				enabled: c,
				run: () => o.onAction("target")
			},
			{
				bind: "d",
				title: "Change depth",
				enabled: c,
				run: o.onDepth
			},
			{
				bind: "s",
				title: "Change scope",
				enabled: c,
				run: () => o.onAction("scope")
			},
			{
				bind: "f",
				title: "Change focus",
				enabled: c,
				run: () => o.onAction("focus")
			},
			{
				bind: "c",
				title: "Change context",
				enabled: c,
				run: () => o.onAction("context")
			},
			{
				bind: "i",
				title: "Toggle settings",
				run: o.onSettings
			}
		]
	}));
	let l = () => `${o.plan.settings.scan.mode}${o.plan.inputs.mode ? "" : " (default)"}`, u = () => [
		["Repository", o.plan.repository],
		["Depth", l()],
		["Scope", S(o.plan)],
		["Focus", o.plan.scanPrompt || "—"],
		["Context", o.plan.contextFiles.map((e) => e.path).join(", ") || "—"],
		["Route", K(o.plan.settings)]
	];
	return (() => {
		var c = t("box"), l = t("text"), p = t("b"), m = t("box"), h = t("text");
		return a(c, l), a(c, m), a(c, h), s(c, "flexDirection", "column"), s(c, "paddingLeft", 2), s(c, "paddingRight", 2), s(c, "paddingBottom", 1), s(c, "gap", 1), a(l, p), i(p, () => o.plan.mock ? "Review mock scan" : "Review this scan"), s(m, "flexDirection", "column"), i(m, e(d, {
			get each() {
				return u();
			},
			children: ([e, n]) => (() => {
				var c = t("box"), l = t("text"), u = t("text");
				return a(c, l), a(c, u), s(c, "flexDirection", "row"), s(l, "width", 12), s(l, "flexShrink", 0), i(l, e), i(u, n), r((e) => s(l, "fg", o.color.muted(), e)), c;
			})()
		})), i(c, e(f, {
			get when() {
				return !o.plan.mock;
			},
			get fallback() {
				return (() => {
					var e = t("text");
					return a(e, n("Mock SDK responses; no model calls.")), r((t) => s(e, "fg", o.color.muted(), t)), e;
				})();
			},
			get children() {
				var e = t("box"), c = t("text"), l = t("text");
				return a(e, c), a(e, l), s(e, "flexDirection", "column"), a(c, n("Starting sends the source in scope and the context files over this route.")), i(l, () => he(o.plan.settings.scan.maxCostUsd)), r((e) => s(l, "fg", o.color.muted(), e)), e;
			}
		}), h), i(c, e(f, {
			get when() {
				return o.preparing;
			},
			get children() {
				var e = t("text");
				return a(e, n("Updating preview…")), r((t) => s(e, "fg", o.color.muted(), t)), e;
			}
		}), h), i(c, e(f, {
			get when() {
				return o.error;
			},
			get children() {
				var e = t("text");
				return i(e, () => o.error), r((t) => s(e, "fg", o.color.error(), t)), e;
			}
		}), h), i(c, e(f, {
			get when() {
				return o.settings;
			},
			get children() {
				var e = t("text");
				return i(e, () => q(o.plan)), r((t) => s(e, "fg", o.color.muted(), t)), e;
			}
		}), h), a(h, n("y start · t target · d depth · s scope · f focus · c context · i settings · esc back")), r((e) => {
			var t = o.color.accent(), n = o.color.muted();
			return t !== e.e && (e.e = s(l, "fg", t, e.e)), n !== e.t && (e.t = s(h, "fg", n, e.t)), e;
		}, {
			e: void 0,
			t: void 0
		}), c;
	})();
}
// src/rpc.ts
var Y = {
	type: "object",
	additionalProperties: !1
}, Me = { "security.setup": Y }, Ne = {
	type: "object",
	properties: {
		mode: {
			type: "string",
			enum: ["standard", "deep"],
			description: "Omit to use the configured default (standard). Deep is slower and costs more."
		},
		repository: {
			type: "string",
			description: "Repository path. Defaults to the current workspace. May be a folder holding several checkouts."
		},
		scopePaths: {
			type: "array",
			items: { type: "string" },
			description: "Paths relative to the repository. Omit to scan the whole repository."
		},
		changes: {
			type: "string",
			description: "Scan only a diff: \"uncommitted\" for staged and unstaged changes, or a base ref such as \"origin/main\" to compare with HEAD. Standard mode only; not combined with scopePaths."
		},
		scanPrompt: {
			type: "string",
			description: "What to focus on, plus architecture or threat assumptions the scan should know."
		},
		contextFiles: {
			type: "array",
			items: { type: "string" },
			description: "Context files or directories, relative to the repository or absolute (other checkouts are fine). A file may be any UTF-8 text (Markdown, Terraform, YAML, JSON), PDF or DOCX. A directory contributes all its text, PDF and DOCX files. No symlinks."
		}
	},
	additionalProperties: !1
}, Pe = {
	type: "object",
	properties: {
		kind: {
			type: "string",
			enum: [
				"policy",
				"validation",
				"fix"
			]
		},
		repository: { type: "string" },
		path: { type: "string" },
		contextFiles: {
			type: "array",
			items: { type: "string" }
		},
		finding: { anyOf: [{ type: "string" }, { type: "object" }] },
		source: {
			type: "object",
			properties: {
				runId: { type: "string" },
				findingId: { type: "string" }
			},
			required: ["runId", "findingId"],
			additionalProperties: !1
		}
	},
	required: ["kind"],
	additionalProperties: !1
}, Fe = {
	type: "object",
	properties: { operationId: { type: "string" } },
	required: ["operationId"],
	additionalProperties: !1
}, X = { type: "string" }, Z = { type: "object" }, Q = Me, Ie = v.define({
	id: "gill.security",
	methods: {
		capabilities: {
			input: Y,
			output: Z,
			errors: Q
		},
		prepare: {
			input: Ne,
			output: Z,
			errors: Q
		},
		start: {
			input: {
				type: "object",
				properties: { planId: X },
				additionalProperties: !1
			},
			output: Z,
			errors: Q
		},
		list: {
			input: Y,
			output: Z,
			errors: Q
		},
		status: {
			input: {
				type: "object",
				properties: {
					runId: X,
					planId: X
				},
				additionalProperties: !1
			},
			output: Z,
			errors: Q
		},
		cancel: {
			input: {
				type: "object",
				properties: { runId: X },
				additionalProperties: !1
			},
			output: Z,
			errors: Q
		},
		operationPrepare: {
			input: Pe,
			output: Z,
			errors: Q
		},
		operationStart: {
			input: Fe,
			output: Z,
			errors: Q
		},
		operationStatus: {
			input: Fe,
			output: Z,
			errors: Q
		},
		operationList: {
			input: Y,
			output: Z,
			errors: Q
		},
		operationAnswer: {
			input: {
				type: "object",
				properties: {
					operationId: X,
					questionId: X,
					answer: X
				},
				required: [
					"operationId",
					"questionId",
					"answer"
				],
				additionalProperties: !1
			},
			output: Z,
			errors: Q
		},
		operationCancel: {
			input: Fe,
			output: Z,
			errors: Q
		},
		operationResolve: {
			input: {
				type: "object",
				properties: {
					operationId: X,
					action: {
						type: "string",
						enum: ["apply", "discard"]
					}
				},
				required: ["operationId", "action"],
				additionalProperties: !1
			},
			output: Z,
			errors: Q
		},
		setup: {
			input: Y,
			output: Z,
			errors: Q
		},
		signIn: {
			input: {
				type: "object",
				properties: { device: { type: "boolean" } },
				additionalProperties: !1
			},
			output: Z,
			errors: Q
		},
		signInCancel: {
			input: Y,
			output: Z,
			errors: Q
		},
		discuss: {
			input: {
				type: "object",
				properties: {
					runId: X,
					findingId: X,
					sessionID: X
				},
				required: [
					"runId",
					"findingId",
					"sessionID"
				],
				additionalProperties: !1
			},
			output: Z,
			errors: Q
		},
		setProfile: {
			input: {
				type: "object",
				properties: { profile: X },
				required: ["profile"],
				additionalProperties: !1
			},
			output: Z,
			errors: Q
		}
	},
	events: {
		changed: { schema: { type: "object" } },
		operationChanged: { schema: { type: "object" } }
	}
}), Le = 3e4;
function Re(e) {
	let t = e.client.rpc(Ie), n = e.location ?? e.data.location.default(), [r, i] = m(), [a, o] = m([]), [s, c] = m({
		policy: !1,
		validation: !1,
		fix: !1
	}), [l, u] = m(""), [d, f] = m(!1), p = !1, h, g = () => h ??= t.capabilities({}, { location: n }).then((e) => {
		let t = e;
		p || c({
			policy: !!t.policy,
			validation: !!t.validation,
			fix: !!t.fix
		});
	}).catch(() => {
		h = void 0;
	}), _ = (e) => {
		let t, n = !1;
		return async () => {
			if (t) return n = !0, t;
			t = (async () => {
				do {
					n = !1;
					try {
						await e();
					} catch (e) {
						p || u(V(e));
					}
				} while (n && !p);
			})();
			try {
				await t;
			} finally {
				t = void 0;
			}
		};
	}, v = _(async () => {
		let e = await t.list({}, { location: n });
		p || i(e);
	}), y = _(async () => {
		await g();
		let e = s();
		if (!e.policy && !e.validation) return;
		let r = await t.operationList({}, { location: n });
		p || o(r.operations);
	}), b = (e) => {
		let t = e.runId ?? e.scanId ?? void 0, n = r(), a = n?.runs.findIndex((e) => e.runId === t) ?? -1;
		if (!n || !t || a < 0) return void v();
		if ((e.revision ?? 0) < (n.runs[a].revision ?? 0)) return;
		let o = [...n.runs];
		o[a] = {
			...e,
			runId: t
		}, i({
			...n,
			runs: o
		});
	}, x = (e) => {
		let t = a(), n = t.findIndex((t) => t.operationId === e.operationId);
		if (n < 0) return void y();
		if (e.revision < t[n].revision) return;
		let r = [...t];
		r[n] = e, o(r);
	};
	return {
		client: t,
		location: n,
		catalog: r,
		runs: () => r()?.runs ?? [],
		operations: a,
		capabilities: s,
		loadCapabilities: g,
		error: l,
		setError: u,
		busy: d,
		perform: async (e) => {
			if (!(p || d())) {
				f(!0), u("");
				try {
					await e();
				} catch (e) {
					p || u(V(e));
				} finally {
					p || f(!1);
				}
			}
		},
		refreshScans: v,
		refreshOperations: y,
		watch: () => {
			v(), y();
			let e = t.events.on("changed", (e) => b(e.data)), n = t.events.on("operationChanged", (e) => x(e.data)), r = setInterval(() => {
				v(), y();
			}, Le);
			return () => {
				e(), n(), clearInterval(r);
			};
		},
		dispose: () => {
			p = !0;
		},
		isDisposed: () => p
	};
}
// src/tui/theme.ts
var $ = {
	text: "#e0e0e0",
	accent: "#9be4c6",
	muted: "#b5b5b5",
	error: "#ffb3b3",
	warning: "#ebc28c",
	success: "#9be4c6"
};
function ze(e) {
	let t = () => e.theme ?? {}, n = (e) => t().text?.feedback?.[e]?.base;
	return {
		text: () => t().text?.base ?? $.text,
		accent: () => n("info") ?? $.accent,
		muted: () => t().text?.muted ?? $.muted,
		error: () => n("error") ?? $.error,
		warning: () => n("warning") ?? $.warning,
		success: () => n("success") ?? $.success
	};
}
// src/tui/view.tsx
var Be = 5, Ve = 8;
function He(u) {
	let p = l(), m = () => Math.max(20, p().width - 4), h = u.color, g = (e) => e.severity === "critical" || e.severity === "high" ? h.error() : h.warning(), _ = (e) => (() => {
		var n = t("text");
		return i(n, () => e.children), r((e) => s(n, "fg", h.muted(), e)), n;
	})(), v = () => {
		let c = () => u.store.runs(), l = () => c().filter((e) => e.status === "running").length;
		return (() => {
			var d = t("box"), p = t("text"), m = t("b"), g = t("span"), _ = n(" · "), v = t("text"), y = t("span"), b = n(" "), x = t("span"), S = n("   "), C = n(" ");
			return a(d, p), a(d, v), s(d, "flexDirection", "column"), s(d, "flexShrink", 0), a(p, m), a(p, g), a(m, n("Security")), a(g, _), i(g, () => u.store.location.directory, null), a(v, y), a(v, x), a(y, b), i(y, (() => {
				var e = o(() => u.tab === "scans");
				return () => e() ? (() => {
					var e = t("b");
					return a(e, n("Scans")), e;
				})() : "Scans";
			})(), b), i(y, () => c().length, null), a(x, S), a(x, C), i(x, (() => {
				var e = o(() => u.tab === "operations");
				return () => e() ? (() => {
					var e = t("b");
					return a(e, n("Operations")), e;
				})() : "Operations";
			})(), C), i(x, () => u.store.operations().length, null), i(v, e(f, {
				get when() {
					return l();
				},
				get children() {
					var e = t("span"), o = n("   "), c = n(" of "), d = n(" running");
					return a(e, o), a(e, c), a(e, d), i(e, l, c), i(e, () => u.store.catalog()?.maxConcurrent ?? 2, d), r((t) => s(e, "style", { fg: h.muted() }, t)), e;
				}
			}), null), i(v, e(f, {
				get when() {
					return u.waiting;
				},
				get children() {
					var e = t("span"), o = n("   "), c = n(" "), l = n(" waiting · a answer");
					return a(e, o), a(e, c), a(e, l), i(e, () => u.waiting, c), i(e, () => u.waiting === 1 ? "question" : "questions", l), r((t) => s(e, "style", { fg: h.warning() }, t)), e;
				}
			}), null), i(d, e(f, {
				get when() {
					return u.setup;
				},
				children: (n) => (() => {
					var o = t("box"), c = t("text");
					return a(o, c), s(o, "flexDirection", "column"), s(o, "flexShrink", 0), i(c, () => J(n()).text), i(o, e(f, {
						get when() {
							return J(n()).warnings.length;
						},
						get children() {
							var e = t("text");
							return i(e, () => J(n()).warnings.join("\n")), r((t) => s(e, "fg", h.warning(), t)), e;
						}
					}), null), r((e) => s(c, "fg", h.muted(), e)), o;
				})()
			}), null), r((e) => {
				var t = { fg: h.muted() }, n = { fg: u.tab === "scans" ? h.accent() : h.muted() }, r = { fg: u.tab === "operations" ? h.accent() : h.muted() };
				return t !== e.e && (e.e = s(g, "style", t, e.e)), n !== e.t && (e.t = s(y, "style", n, e.t)), r !== e.a && (e.a = s(x, "style", r, e.a)), e;
			}, {
				e: void 0,
				t: void 0,
				a: void 0
			}), d;
		})();
	}, y = (c) => {
		let l = () => c.run;
		return (() => {
			var c = t("box"), d = t("text"), p = t("b"), m = t("text"), g = n(" · "), _ = n(" · "), v = t("text"), y = t("text");
			return a(c, d), a(c, m), a(c, v), a(c, y), s(c, "flexDirection", "column"), a(d, p), i(p, () => x(l())), a(m, g), a(m, _), i(m, () => l().repository, g), i(m, () => C(l()), _), i(m, () => l().mode ?? "fixture", null), i(v, () => ee(l()), null), i(v, e(f, {
				get when() {
					return B(l().startedAt, l().finishedAt, u.now);
				},
				children: (e) => [" · ", o(e)]
			}), null), i(v, e(f, {
				get when() {
					return te(l());
				},
				get children() {
					return [" · ", o(() => O(l()))];
				}
			}), null), i(c, e(f, {
				get when() {
					return l().status === "running";
				},
				get children() {
					var e = t("text");
					return i(e, () => k(l())), r((t) => s(e, "fg", h.muted(), t)), e;
				}
			}), y), i(y, () => j(l())), i(c, e(f, {
				get when() {
					return l().error;
				},
				get children() {
					var e = t("text");
					return i(e, () => l().error), r((t) => s(e, "fg", h.error(), t)), e;
				}
			}), null), i(c, e(f, {
				get when() {
					return l().status === "cancelled";
				},
				get children() {
					var e = t("text");
					return a(e, n("Cancelled before finishing; this scan has no results.")), e;
				}
			}), null), i(c, e(f, {
				get when() {
					return l().status === "completed";
				},
				get children() {
					var e = t("text");
					return i(e, () => ae(l())), e;
				}
			}), null), i(c, e(f, {
				get when() {
					return u.details;
				},
				get children() {
					return e(b, { get run() {
						return l();
					} });
				}
			}), null), r((e) => {
				var t = h.muted(), n = h.muted();
				return t !== e.e && (e.e = s(m, "fg", t, e.e)), n !== e.t && (e.t = s(y, "fg", n, e.t)), e;
			}, {
				e: void 0,
				t: void 0
			}), c;
		})();
	}, b = (c) => {
		let l = () => c.run;
		return (() => {
			var c = t("box");
			return s(c, "flexDirection", "column"), s(c, "paddingTop", 1), i(c, e(_, { get children() {
				return ["Run ", o(() => l().runId)];
			} }), null), i(c, e(f, {
				get when() {
					return l().telemetry?.authentication;
				},
				get children() {
					return e(_, { get children() {
						return ["Signed in with ", o(() => l().telemetry?.authentication)];
					} });
				}
			}), null), i(c, e(f, {
				get when() {
					return L(l());
				},
				get children() {
					var e = t("text");
					return i(e, () => L(l())), r((t) => s(e, "fg", h.warning(), t)), e;
				}
			}), null), i(c, e(f, {
				get when() {
					return R(l());
				},
				get children() {
					var e = t("text");
					return i(e, () => R(l())), r((t) => s(e, "fg", h.warning(), t)), e;
				}
			}), null), i(c, e(f, {
				get when() {
					return l().telemetry?.measurement?.coverage !== "complete";
				},
				get children() {
					return e(_, { get children() {
						return M(l());
					} });
				}
			}), null), i(c, e(f, {
				get when() {
					return F(l());
				},
				get children() {
					return e(_, { get children() {
						return F(l());
					} });
				}
			}), null), i(c, e(f, {
				get when() {
					return I(l());
				},
				get children() {
					return e(_, { get children() {
						return I(l());
					} });
				}
			}), null), i(c, e(f, {
				get when() {
					return o(() => l().status === "running")() && l().deepProgress;
				},
				get children() {
					return e(_, { get children() {
						return ne(l());
					} });
				}
			}), null), i(c, e(f, {
				get when() {
					return l().status === "completed";
				},
				get children() {
					return [e(_, { get children() {
						return ["Coverage: ", o(() => oe(l()))];
					} }), e(_, { get children() {
						return ["Repository matching: ", o(() => z(l()))];
					} })];
				}
			}), null), i(c, e(f, {
				get when() {
					return N(l()).length;
				},
				get children() {
					return [(() => {
						var e = t("text");
						return a(e, n("Activity")), e;
					})(), e(d, {
						get each() {
							return P(l()).slice(0, 5);
						},
						children: (t) => e(_, { get children() {
							return [
								o(() => re(t.worker)),
								" · ",
								o(() => t.label),
								" ·",
								" ",
								o(() => ie(t.status, l()))
							];
						} })
					})];
				}
			}), null), i(c, e(f, {
				get when() {
					return l().events.length;
				},
				get children() {
					return [(() => {
						var e = t("text");
						return a(e, n("Milestones")), e;
					})(), e(d, {
						get each() {
							return [...l().events].reverse().slice(0, 3);
						},
						children: (t) => e(_, { get children() {
							return [
								o(() => new Date(t.time).toLocaleTimeString()),
								" · ",
								o(() => t.message)
							];
						} })
					})];
				}
			}), null), c;
		})();
	}, S = () => {
		let c = () => u.store.runs(), l = () => Math.max(0, c().indexOf(u.run)), p = () => Se(c(), l(), Be), v = () => u.run ? ue(u.run) : [], b = () => u.focus === "findings";
		return e(f, {
			get when() {
				return u.run;
			},
			get fallback() {
				return (() => {
					var e = t("text");
					return a(e, n("No scans yet. Press n to start one.")), e;
				})();
			},
			children: (l) => (() => {
				var x = t("box"), S = t("box");
				return a(x, S), s(x, "flexDirection", "column"), s(x, "gap", 1), s(S, "flexDirection", "column"), i(S, e(d, {
					get each() {
						return p().items;
					},
					children: (e) => {
						let n = () => e.runId === l().runId;
						return (() => {
							var a = t("text");
							return i(a, () => xe(`${n() ? "›" : " "} ${_e(e, u.now)}`, m())), r((e) => s(a, "fg", n() ? b() ? void 0 : h.accent() : h.muted(), e)), a;
						})();
					}
				}), null), i(S, e(f, {
					get when() {
						return c().length > Be;
					},
					get children() {
						return e(_, { get children() {
							return [
								"  ",
								o(() => p().start + 1),
								"–",
								o(() => p().start + p().items.length),
								" of",
								" ",
								o(() => c().length)
							];
						} });
					}
				}), null), i(x, e(y, { get run() {
					return l();
				} }), null), i(x, e(f, {
					get when() {
						return v().length;
					},
					get children() {
						var o = t("box"), c = t("text"), f = t("b"), p = n(" "), _ = t("span");
						return a(o, c), s(o, "flexDirection", "column"), a(c, f), a(c, p), a(c, _), a(f, n("Findings")), i(_, () => W(l())), i(o, e(d, {
							get each() {
								return v();
							},
							children: (e, o) => {
								let c = () => b() && o() === u.findingIndex, d = () => de(l(), e.id), f = () => d() ? d().label : `${e.path}:${e.line}`;
								return (() => {
									var l = t("box"), u = t("text"), p = t("text"), _ = t("text"), v = t("text"), y = n(" ");
									return a(l, u), a(l, p), a(l, _), a(l, v), s(l, "flexDirection", "row"), s(u, "flexShrink", 0), i(u, () => c() ? "› " : "  "), s(p, "width", 9), s(p, "flexShrink", 0), i(p, () => e.severity.toUpperCase()), s(_, "flexGrow", 1), i(_, () => xe(e.title, Math.max(10, m() - f().length - 14))), a(v, y), s(v, "flexShrink", 0), i(v, f, null), r((t) => {
										var n = `finding-${o()}`, r = c() ? h.accent() : void 0, i = g(e), a = c() ? h.accent() : void 0, f = d()?.tone === "good" ? h.success() : d()?.tone === "warn" ? h.warning() : h.muted();
										return n !== t.e && (t.e = s(l, "id", n, t.e)), r !== t.t && (t.t = s(u, "fg", r, t.t)), i !== t.a && (t.a = s(p, "fg", i, t.a)), a !== t.o && (t.o = s(_, "fg", a, t.o)), f !== t.i && (t.i = s(v, "fg", f, t.i)), t;
									}, {
										e: void 0,
										t: void 0,
										a: void 0,
										o: void 0,
										i: void 0
									}), l;
								})();
							}
						}), null), r((e) => s(_, "style", { fg: h.muted() }, e)), o;
					}
				}), null), i(x, e(f, {
					get when() {
						return o(() => l().status === "completed")() && !v().length;
					},
					get children() {
						return e(_, { children: "No findings reported. Press d for coverage." });
					}
				}), null), x;
			})()
		});
	}, T = (o) => {
		let c = () => o.finding, l = (n) => (() => {
			var r = t("box"), o = t("text");
			return a(r, o), s(r, "flexDirection", "column"), i(r, e(_, { get children() {
				return n.title;
			} }), o), i(o, () => n.body), r;
		})();
		return (() => {
			var o = t("box"), p = t("box"), m = t("text"), _ = t("span"), v = n(" · "), y = t("b"), b = t("text"), x = n(":"), S = n(" · "), C = n(" · "), T = n(" confidence");
			return a(o, p), s(o, "flexDirection", "column"), s(o, "gap", 1), a(p, m), a(p, b), s(p, "flexDirection", "column"), a(m, _), a(m, v), a(m, y), i(_, () => c().severity.toUpperCase()), i(y, () => c().title), a(b, x), a(b, S), a(b, C), a(b, T), i(b, () => c().path, x), i(b, () => c().line, S), i(b, () => c().cwe, C), i(b, () => c().confidence, T), i(o, e(l, {
				title: "Summary",
				get body() {
					return c().summary;
				}
			}), null), i(o, e(l, {
				title: "Evidence",
				get body() {
					return c().evidence;
				}
			}), null), i(o, e(l, {
				title: "Remediation",
				get body() {
					return c().remediation;
				}
			}), null), i(o, e(d, {
				get each() {
					return u.findingWork;
				},
				children: (o) => (() => {
					var c = t("box"), l = t("text"), u = t("b"), d = t("span"), p = n(" · ");
					return a(c, l), s(c, "flexDirection", "column"), s(c, "gap", 1), a(l, u), a(l, d), i(u, () => ve(o)), a(d, p), i(d, () => w(o.status), null), i(c, e(f, {
						get when() {
							return o.error;
						},
						get children() {
							var e = t("text");
							return i(e, () => o.error), r((t) => s(e, "fg", h.error(), t)), e;
						}
					}), null), i(c, e(D, { op: o }), null), r((e) => s(d, "style", { fg: h.muted() }, e)), c;
				})()
			}), null), r((e) => {
				var t = { fg: g(c()) }, n = h.muted();
				return t !== e.e && (e.e = s(_, "style", t, e.e)), n !== e.t && (e.t = s(b, "fg", n, e.t)), e;
			}, {
				e: void 0,
				t: void 0
			}), o;
		})();
	}, E = (n) => (() => {
		var a = t("box");
		return s(a, "flexDirection", "column"), i(a, e(d, {
			get each() {
				return G(n.diff);
			},
			children: (e) => (() => {
				var n = t("text");
				return i(n, () => e.text || " "), r((t) => s(n, "fg", e.kind === "add" ? h.success() : e.kind === "del" ? h.error() : e.kind === "context" ? void 0 : h.muted(), t)), n;
			})()
		})), a;
	})(), D = (r) => e(f, {
		get when() {
			return r.op.result;
		},
		children: (r) => {
			let c = r();
			return c.kind === "policy" ? (() => {
				var r = t("box"), l = t("text");
				return a(r, l), s(r, "flexDirection", "column"), s(r, "gap", 1), i(r, e(_, { get children() {
					return [
						"Draft for ",
						o(() => c.targetPath),
						". Not written to disk."
					];
				} }), l), i(l, () => c.content), i(r, e(f, {
					get when() {
						return c.reviewNotes.length;
					},
					get children() {
						var r = t("box");
						return s(r, "flexDirection", "column"), i(r, e(_, { children: "Review notes" }), null), i(r, e(d, {
							get each() {
								return c.reviewNotes;
							},
							children: (e) => (() => {
								var r = t("text"), o = n("- ");
								return a(r, o), i(r, e, null), r;
							})()
						}), null), r;
					}
				}), null), i(r, e(f, {
					get when() {
						return c.truncated;
					},
					get children() {
						return e(_, { children: "Truncated here; the full draft is in the local SDK artifacts." });
					}
				}), null), r;
			})() : c.kind === "fix" ? (() => {
				var n = t("box"), r = t("text"), l = t("b");
				return a(n, r), s(n, "flexDirection", "column"), s(n, "gap", 1), a(r, l), i(l, () => le(c.status)), i(r, e(f, {
					get when() {
						return o(() => c.resolution !== "pending")() && c.resolution !== "none";
					},
					get children() {
						return [
							" ",
							"· ",
							o(() => c.resolution)
						];
					}
				}), null), i(n, e(f, {
					get when() {
						return c.report;
					},
					get children() {
						var e = t("text");
						return i(e, () => c.report), e;
					}
				}), null), i(n, e(f, {
					get when() {
						return c.diff;
					},
					get fallback() {
						return e(_, { children: "No files were changed." });
					},
					get children() {
						return [e(_, { get children() {
							return c.resolution === "pending" ? "Proposed change, not applied yet. y applies it to your working tree; r discards it." : "Change";
						} }), e(E, { get diff() {
							return c.diff;
						} })];
					}
				}), null), i(n, e(f, {
					get when() {
						return c.truncated;
					},
					get children() {
						return e(_, { children: "Diff truncated here; applying uses the whole change." });
					}
				}), null), n;
			})() : (() => {
				var n = t("box"), r = t("text"), o = t("b"), l = t("text");
				return a(n, r), a(n, l), s(n, "flexDirection", "column"), s(n, "gap", 1), a(r, o), i(o, () => fe(c.disposition)), i(l, () => c.report), i(n, e(f, {
					get when() {
						return c.truncated;
					},
					get children() {
						return e(_, { children: "Truncated here; the full report is in the local SDK artifacts." });
					}
				}), null), n;
			})();
		}
	}), A = () => {
		let c = () => u.store.operations(), l = () => Math.max(0, c().indexOf(u.operation)), p = () => Se(c(), l(), Ve);
		return e(f, {
			get when() {
				return u.opsAvailable;
			},
			get fallback() {
				return (() => {
					var e = t("text");
					return a(e, n("Policy drafts and validation need the Codex Security engine.")), e;
				})();
			},
			get children() {
				return e(f, {
					get when() {
						return u.operation;
					},
					get fallback() {
						return (() => {
							var e = t("text");
							return a(e, n("No policy drafts or validations yet. Press p to draft a policy, or v on a finding to validate it.")), e;
						})();
					},
					children: (n) => (() => {
						var l = t("box"), u = t("box");
						return a(l, u), s(l, "flexDirection", "column"), s(l, "gap", 1), s(u, "flexDirection", "column"), i(u, e(d, {
							get each() {
								return p().items;
							},
							children: (e) => {
								let a = () => e.operationId === n().operationId;
								return (() => {
									var n = t("text");
									return i(n, () => xe(`${a() ? "›" : " "} ${ye(e)}`, m())), r((e) => s(n, "fg", a() ? h.accent() : h.muted(), e)), n;
								})();
							}
						}), null), i(u, e(f, {
							get when() {
								return c().length > Ve;
							},
							get children() {
								return e(_, { get children() {
									return [
										"  ",
										o(() => p().start + 1),
										"–",
										o(() => p().start + p().items.length),
										" of",
										" ",
										o(() => c().length)
									];
								} });
							}
						}), null), i(l, e(V, { get op() {
							return n();
						} }), null), l;
					})()
				});
			}
		});
	}, V = (o) => (() => {
		var c = t("box"), l = t("text"), u = t("b"), d = n(" · "), p = t("text");
		return a(c, l), a(c, p), s(c, "flexDirection", "column"), a(l, u), a(l, d), i(u, () => ve(o.op)), i(l, () => w(o.op.status), null), i(c, e(_, { get children() {
			return o.op.repository;
		} }), p), i(p, () => o.op.phase), i(c, e(f, {
			get when() {
				return o.op.question;
			},
			get children() {
				var e = t("text");
				return a(e, n("Waiting for your answer. Press a.")), r((t) => s(e, "fg", h.warning(), t)), e;
			}
		}), null), i(c, e(f, {
			get when() {
				return o.op.error;
			},
			get children() {
				var e = t("text");
				return i(e, () => o.op.error), r((t) => s(e, "fg", h.error(), t)), e;
			}
		}), null), i(c, e(f, {
			get when() {
				return o.op.result;
			},
			get children() {
				return e(_, { children: "Press enter to read the result." });
			}
		}), null), c;
	})(), se = (c) => {
		let l = () => c.op;
		return (() => {
			var c = t("box"), u = t("box"), p = t("text"), m = t("b"), g = n(" · "), v = t("text");
			return a(c, u), s(c, "flexDirection", "column"), s(c, "gap", 1), a(u, p), a(u, v), s(u, "flexDirection", "column"), a(p, m), a(p, g), i(m, () => ve(l())), i(p, () => w(l().status), null), i(u, e(_, { get children() {
				return [o(() => l().repository), o(() => o(() => l().kind === "policy")() ? ` · ${l().plan.path ?? "."}` : "")];
			} }), v), i(v, () => l().phase), i(u, e(f, {
				get when() {
					return l().estimatedCostUsd !== void 0;
				},
				get children() {
					return e(_, { get children() {
						return ["Estimated usage USD ", o(() => (l().estimatedCostUsd ?? 0).toFixed(2))];
					} });
				}
			}), null), i(c, e(f, {
				get when() {
					return o(() => l().kind === "validation")() && l().plan.finding;
				},
				get children() {
					var n = t("box"), r = t("text");
					return a(n, r), s(n, "flexDirection", "column"), i(n, e(_, { children: "Finding" }), r), i(r, () => l().plan.finding), n;
				}
			}), null), i(c, e(f, {
				get when() {
					return l().question;
				},
				children: (o) => (() => {
					var c = t("box"), l = t("text");
					return a(c, l), s(c, "flexDirection", "column"), a(l, n("Waiting for your answer. Press a.")), i(c, e(d, {
						get each() {
							return o().questions;
						},
						children: (e, n) => (() => {
							var r = t("text");
							return i(r, () => `${n() + 1}. ${e}`), r;
						})()
					}), null), r((e) => s(l, "fg", h.warning(), e)), c;
				})()
			}), null), i(c, e(f, {
				get when() {
					return l().error;
				},
				get children() {
					var e = t("text");
					return i(e, () => l().error), r((t) => s(e, "fg", h.error(), t)), e;
				}
			}), null), i(c, e(D, { get op() {
				return l();
			} }), null), c;
		})();
	}, ce = () => {
		let e = () => u.keys.filter((e) => e.key && e.label && e.when() && !e.secondary).map((e) => `${e.key} ${e.label()}`).join(" · ");
		return (() => {
			var n = t("text");
			return i(n, (() => {
				var t = o(() => !!u.store.busy());
				return () => t() ? "Working…" : e();
			})()), r((e) => s(n, "fg", h.muted(), e)), n;
		})();
	}, H = () => {
		let e = u.run ? ue(u.run) : [];
		return e[Math.min(u.findingIndex, e.length - 1)];
	};
	return (() => {
		var n = t("box"), l = t("scrollbox");
		return a(n, l), s(n, "flexDirection", "column"), s(n, "flexGrow", 1), s(n, "paddingLeft", 1), s(n, "paddingRight", 1), i(n, e(v, {}), l), i(n, e(f, {
			get when() {
				return u.store.error();
			},
			get children() {
				var e = t("text");
				return i(e, () => u.store.error()), r((t) => s(e, "fg", h.error(), t)), e;
			}
		}), l), i(n, e(f, {
			get when() {
				return u.store.catalog()?.historyError;
			},
			get children() {
				var e = t("text");
				return i(e, () => u.store.catalog()?.historyError), r((t) => s(e, "fg", h.error(), t)), e;
			}
		}), l), c((e) => u.ref(e), l), s(l, "flexGrow", 1), s(l, "paddingTop", 1), i(l, e(f, {
			get when() {
				return u.tab === "scans";
			},
			get children() {
				return e(f, {
					get when() {
						return o(() => u.detail === "finding")() && H();
					},
					get fallback() {
						return e(S, {});
					},
					children: (t) => e(T, { get finding() {
						return t();
					} })
				});
			}
		}), null), i(l, e(f, {
			get when() {
				return u.tab === "operations";
			},
			get children() {
				return e(f, {
					get when() {
						return o(() => u.detail === "operation")() && u.operation;
					},
					get fallback() {
						return e(A, {});
					},
					children: (t) => e(se, { get op() {
						return t();
					} })
				});
			}
		}), null), i(n, e(ce, {}), null), n;
	})();
}
// src/tui/app.tsx
var Ue = "security";
function We(t) {
	let n = Re(t), r = ze(t), [i, a] = m("scans"), [s, c] = m("runs"), [l, u] = m(), [d, f] = m(), [v, b] = m(0), [x, S] = m(), [C, w] = m(!1), [T, E] = m(), D = () => n.client.setup({}, { location: n.location }).then((e) => E(e)).catch((e) => n.setError(V(e)));
	p(() => {
		if (!T()?.signIn?.pending) return;
		let e = setInterval(() => void D(), 2e3);
		g(() => clearInterval(e));
	});
	let ee = () => n.perform(async () => {
		let e = { location: n.location };
		if (T()?.signIn?.pending) await n.client.signInCancel({}, e);
		else {
			let r = await t.ui.dialog.select({
				title: "Sign in to Codex Security with ChatGPT",
				options: [{
					title: "In my browser",
					description: "Opens the sign-in page.",
					value: !1
				}, {
					title: "With a device code",
					description: "For a remote machine: shows a code to enter on another device.",
					value: !0
				}]
			});
			if (r === void 0) return;
			await n.client.signIn({ device: r }, e);
		}
		await D();
	}), te = () => n.perform(async () => {
		let e = T();
		if (!e) return;
		let r = await t.ui.dialog.select({
			title: "Codex profile",
			current: e.profile ?? "",
			options: [{
				title: "None",
				description: "Use the Codex config as it is.",
				value: ""
			}, ...e.profiles.map((e) => ({
				title: e,
				value: e
			}))]
		});
		r !== void 0 && (await n.client.setProfile({ profile: r }, { location: n.location }), await D());
	}), O, ne = me(t.location?.directory) ? t.location.directory : void 0, k = () => {
		let e = t.ui.router.current();
		return e.type === "plugin" && e.name === "security";
	}, A = n.runs, j = () => A().find((e) => e.runId === d()) ?? A()[0], M = () => j() ? ue(j()) : [], N = () => M()[Math.min(v(), M().length - 1)], P = () => n.operations().find((e) => e.operationId === x()) ?? n.operations()[0], re = () => n.operations().filter((e) => e.question);
	p(h(d, () => b(0), { defer: !0 }));
	let ie = () => {
		k() || (O = t.ui.router.current()), t.ui.router.navigate({
			type: "plugin",
			name: Ue
		});
	}, F = () => t.ui.router.navigate(O ?? { type: "home" }), I = async () => {
		if (ne) return ne;
		let e = await t.ui.dialog.prompt({
			title: "Target repository",
			description: "Absolute path to a local repository.",
			placeholder: "/path/to/project"
		});
		return e?.trim() ? Ae(e.trim()) : void 0;
	}, L = we(t, n, I, (e) => {
		S(e), a("operations"), u(void 0);
	}), R = () => n.perform(async () => {
		await n.refreshScans();
		let e = n.catalog()?.maxConcurrent ?? 2;
		if (A().filter((e) => e.status === "running").length >= e) throw Error(`All ${e} scan slots are in use. Start another when one finishes.`);
		let i = await I();
		if (!i) return;
		let o = async (e) => {
			let t = y(await n.client.prepare(e, { location: n.location })).plan;
			if (!t) throw Error("The server returned no preview.");
			return t;
		}, s = await Oe(t, r, o, await o({ repository: i }));
		if (!s) return;
		let l = y(await n.client.start({ planId: s.id }, { location: n.location }));
		a("scans"), u(void 0), c("runs"), f(l.runId), await n.refreshScans();
	}), ae = () => n.perform(async () => {
		let e = j();
		e?.status === "running" && await t.ui.dialog.confirm({
			title: "Cancel scan",
			message: `Stop the scan of ${e.repository}? A cancelled scan has no results.`,
			label: {
				confirm: "Cancel scan",
				cancel: "Keep running"
			}
		}) && (await n.client.cancel({ runId: e.runId }, { location: n.location }), await n.refreshScans());
	}), oe = async () => {
		let e = j();
		if (!e?.findings.length) return L.validateText();
		let n = l() === "finding" || s() === "findings" ? N() : void 0;
		if (!n) {
			let r = await t.ui.dialog.select({
				title: `Validate a finding · ${e.repository}`,
				options: e.findings.map((e) => ({
					title: `${e.severity.toUpperCase()} ${e.title}`,
					description: `${e.path}:${e.line}`,
					value: e.id
				}))
			});
			n = e.findings.find((e) => e.id === r);
		}
		n && await L.validate(e, n);
	}, z, B = (e) => {
		if (l()) return z?.scrollBy(e);
		if (i() === "operations") {
			let t = n.operations(), r = t.indexOf(P()), i = t[Math.max(0, Math.min(t.length - 1, r + e))];
			i && S(i.operationId);
			return;
		}
		if (s() === "findings") {
			let t = Math.max(0, Math.min(M().length - 1, v() + e));
			return b(t), z?.scrollChildIntoView(`finding-${t}`);
		}
		let t = A(), r = t.indexOf(j()), a = t[Math.max(0, Math.min(t.length - 1, r + e))];
		a && f(a.runId);
	}, se = () => {
		if (i() === "operations") return void (P() && u("operation"));
		if (s() === "runs") return M().length ? (c("findings"), z?.scrollChildIntoView(`finding-${v()}`)) : void 0;
		u("finding");
	}, ce = () => {
		if (l()) return void u(void 0);
		if (i() === "scans" && s() === "findings") return void c("runs");
		F();
	}, le = () => {
		u(void 0), c("runs"), a((e) => e === "scans" ? "operations" : "scans"), n.refreshOperations();
	}, H = () => P()?.question ? P() : re()[0], U = () => i() === "scans", W = () => !l(), de = () => {
		let e = {
			runId: j()?.runId,
			findingId: N()?.id
		}, t = n.operations().filter((t) => t.plan.source?.runId === e.runId && t.plan.source?.findingId === e.findingId);
		return ["validation", "fix"].flatMap((e) => t.find((t) => t.kind === e) ?? []);
	}, G = () => {
		let e = (e) => e?.result?.kind === "fix" && e.result.resolution === "pending" ? e : void 0;
		return U() ? l() === "finding" ? de().map(e).find(Boolean) : void 0 : e(P());
	}, fe = () => O?.type === "session", pe = () => n.perform(async () => {
		O?.type === "session" && (await n.client.discuss({
			runId: j().runId,
			findingId: N().id,
			sessionID: O.sessionID
		}, { location: n.location }), F());
	}), K = () => t.ui.dialog.alert({
		title: "Security keys",
		message: ge.filter((e) => e.key && e.label && e.when()).map((e) => `${e.key.padEnd(6)} ${e.label()}`).join("\n")
	}), q = () => U() && !!N() && (l() === "finding" || s() === "findings"), J = () => n.capabilities().policy || n.capabilities().validation, he = () => !!l() || (U() ? A().length > 1 || s() === "findings" : n.operations().length > 1), ge = [
		{
			bind: "up,k",
			run: () => B(-1),
			when: () => he()
		},
		{
			bind: "down,j",
			key: "↑↓",
			label: () => l() ? "scroll" : "move",
			run: () => B(1),
			when: () => he()
		},
		{
			bind: "return",
			key: "enter",
			label: () => U() && s() === "runs" ? "findings" : "open",
			run: se,
			when: () => W() && (U() ? !!M().length : !!P())
		},
		{
			bind: "v",
			key: "v",
			label: () => "validate",
			run: oe,
			when: () => n.capabilities().validation && q()
		},
		{
			bind: "x",
			key: "x",
			label: () => "propose fix",
			run: () => L.fix(j(), N()),
			when: () => n.capabilities().fix && q()
		},
		{
			bind: "y",
			key: "y",
			label: () => "apply fix",
			run: () => L.resolve(G(), "apply"),
			when: () => !!G()
		},
		{
			bind: "r",
			key: "r",
			label: () => "discard fix",
			run: () => L.resolve(G(), "discard"),
			when: () => !!G()
		},
		{
			bind: "g",
			key: "g",
			label: () => "discuss in chat",
			run: pe,
			when: () => fe() && q()
		},
		{
			bind: "s",
			key: "s",
			label: () => "start",
			run: () => L.start(P()),
			when: () => !U() && P()?.status === "prepared"
		},
		{
			bind: "a",
			key: "a",
			label: () => "answer",
			run: () => L.answer(H()),
			when: () => !!H()
		},
		{
			bind: "c",
			key: "c",
			label: () => "cancel",
			run: () => U() ? ae() : L.cancel(P()),
			when: () => U() ? W() && j()?.status === "running" : be(P())
		},
		{
			bind: "d",
			key: "d",
			label: () => C() ? "hide details" : "details",
			run: () => w((e) => !e),
			when: () => U() && W() && !!j(),
			secondary: !0
		},
		{
			bind: "n",
			key: "n",
			label: () => "new scan",
			run: R,
			when: () => !0,
			get secondary() {
				return A().length > 0;
			}
		},
		{
			bind: "l",
			key: "l",
			label: () => T()?.signIn?.pending ? "cancel sign-in" : "sign in",
			run: ee,
			when: () => W() && !!T()?.signIn && T()?.signIn?.state !== "signed-in",
			get secondary() {
				return T()?.signIn?.state === "shared" && !T()?.signIn?.pending;
			}
		},
		{
			bind: "o",
			key: "o",
			label: () => "profile",
			run: te,
			when: () => W() && (T()?.profiles.length ?? 0) > 1,
			secondary: !0
		},
		{
			bind: "p",
			key: "p",
			label: () => "draft policy",
			run: L.draftPolicy,
			when: () => !U() && W() && n.capabilities().policy,
			secondary: !0
		},
		{
			bind: "tab",
			key: "tab",
			label: () => U() ? "operations" : "scans",
			run: le,
			when: () => !0
		},
		{
			bind: "h",
			key: "h",
			label: () => "all keys",
			run: K,
			when: () => !0
		},
		{
			bind: "escape",
			key: "esc",
			label: () => "back",
			run: ce,
			when: () => !0
		}
	];
	return {
		store: n,
		open: ie,
		onRoute: k,
		View: () => {
			let [a, c] = m(Date.now());
			return _(() => {
				D(), n.loadCapabilities(), g(n.watch());
			}), p(() => {
				if (!A().some((e) => e.status === "running")) return;
				let e = setInterval(() => c(Date.now()), 1e3);
				g(() => clearInterval(e));
			}), t.keymap.layer(() => ({
				priority: 10,
				enabled: k,
				commands: ge.map((e) => ({
					bind: e.bind,
					title: e.label ? `Security: ${e.label()}` : void 0,
					group: "Security",
					enabled: e.when,
					run: () => void e.run()
				}))
			})), e(He, {
				ctx: t,
				color: r,
				store: n,
				keys: ge,
				get now() {
					return a();
				},
				get tab() {
					return i();
				},
				get focus() {
					return s();
				},
				get findingWork() {
					return o(() => l() === "finding")() ? de() : [];
				},
				get detail() {
					return l();
				},
				get run() {
					return j();
				},
				get findingIndex() {
					return v();
				},
				get operation() {
					return P();
				},
				get details() {
					return C();
				},
				get waiting() {
					return re().length;
				},
				get opsAvailable() {
					return J();
				},
				get setup() {
					return T();
				},
				ref: (e) => z = e
			});
		},
		newScan: R,
		draftPolicy: L.draftPolicy,
		validate: oe,
		showOperations: () => {
			a("operations"), u(void 0);
		}
	};
}
// src/tui.tsx
var Ge = u.define({
	id: "gill.security.tui",
	setup(t) {
		let n = We(t), r = t.ui.router.register({
			name: Ue,
			render: () => e(n.View, {})
		}), i = /* @__PURE__ */ new Set(), a = n.store.client.events.on("operationChanged", (e) => {
			let r = e.data;
			r.question && !i.has(r.question.id) && (i.add(r.question.id), n.onRoute() || t.ui.toast.show({
				title: "Security",
				message: "A policy draft has a question for you. Open /security and press a.",
				variant: "info"
			}));
		}), o = (e, t, r) => ({
			id: `security.${e || "open"}`,
			title: t,
			group: "Security",
			palette: !0,
			slash: { name: e ? `security-${e}` : "security" },
			run: () => {
				n.open(), r();
			}
		});
		return t.keymap.layer(() => ({
			mode: "global",
			commands: [
				o("", "Security: open", () => {}),
				o("scan", "Security: new scan", n.newScan),
				o("policy", "Security: draft a policy", () => (n.showOperations(), n.draftPolicy())),
				o("validate", "Security: validate a finding", n.validate)
			]
		})), () => {
			a(), n.store.dispose(), r();
		};
	}
});
export { Ge as default };
