import { createComponent as e, createElement as t, createTextNode as n, effect as r, insert as i, insertNode as a, memo as o, setProp as s } from "@opentui/solid";
import { Plugin as c } from "@opencode/plugin/tui";
import { For as l, Show as u, createEffect as d, createSignal as f, on as p } from "solid-js";
import { Rpc as m } from "@opencode/plugin/rpc";
// src/rpc.ts
var h = {
	type: "object",
	additionalProperties: !1
}, g = { "security.setup": h }, _ = {
	type: "object",
	properties: {
		mode: {
			type: "string",
			enum: ["standard", "deep"],
			description: "Optional mode for this scan. Explicit user request wins; otherwise omit to use global mode (standard by default). Do not ask when the request is clear."
		},
		repository: {
			type: "string",
			description: "Optional local repository path. Defaults to the known current OpenCode workspace; use an absolute path when session context is unknown. This request only, never a global target."
		},
		scopePaths: {
			type: "array",
			items: { type: "string" },
			maxItems: 32,
			description: "Existing paths relative to repository. Omit or use [] for whole repository. No globs or traversal."
		},
		scanPrompt: {
			type: "string",
			maxLength: 8e3,
			description: "Focused security instructions and relevant architecture/threat assumptions. Ask the user for missing material context. Never copy whole conversation or include secrets."
		},
		contextFiles: {
			type: "array",
			items: { type: "string" },
			maxItems: 8,
			description: "Repository-relative text documentation to add as supporting context. No credentials or files outside repository."
		}
	},
	additionalProperties: !1
}, v = {
	type: "object",
	properties: {
		kind: {
			type: "string",
			enum: ["policy", "validation"]
		},
		repository: { type: "string" },
		path: { type: "string" },
		contextFiles: {
			type: "array",
			items: { type: "string" },
			maxItems: 8
		},
		finding: { anyOf: [{ type: "string" }, { type: "object" }] }
	},
	required: ["kind"],
	additionalProperties: !1
}, y = {
	type: "object",
	properties: { operationId: { type: "string" } },
	required: ["operationId"],
	additionalProperties: !1
}, b = m.define({
	id: "gill.security",
	methods: {
		capabilities: {
			input: h,
			output: { type: "object" }
		},
		operationPrepare: {
			input: v,
			output: { type: "object" },
			errors: g
		},
		operationStart: {
			errors: g,
			input: {
				type: "object",
				properties: {
					operationId: { type: "string" },
					approveOpenAIInference: { type: "boolean" },
					approveUncappedValidation: { type: "boolean" }
				},
				required: ["operationId"],
				additionalProperties: !1
			},
			output: { type: "object" }
		},
		operationStatus: {
			input: y,
			output: { type: "object" }
		},
		operationList: {
			input: h,
			output: { type: "object" }
		},
		operationAnswer: {
			input: {
				type: "object",
				properties: {
					operationId: { type: "string" },
					questionId: { type: "string" },
					answer: {
						type: "string",
						maxLength: 16384
					}
				},
				required: [
					"operationId",
					"questionId",
					"answer"
				],
				additionalProperties: !1
			},
			output: { type: "object" }
		},
		operationCancel: {
			input: y,
			output: { type: "object" }
		},
		prepare: {
			input: _,
			output: { type: "object" },
			errors: g
		},
		start: {
			errors: g,
			input: {
				type: "object",
				properties: {
					planId: { type: "string" },
					approveOpenAIInference: { type: "boolean" }
				},
				additionalProperties: !1
			},
			output: { type: "object" }
		},
		list: {
			input: h,
			output: { type: "object" }
		},
		status: {
			input: {
				type: "object",
				properties: {
					runId: { type: "string" },
					planId: { type: "string" }
				},
				additionalProperties: !1
			},
			output: { type: "object" }
		},
		cancel: {
			input: {
				type: "object",
				properties: { runId: { type: "string" } },
				additionalProperties: !1
			},
			output: { type: "object" }
		}
	},
	events: {
		changed: { schema: { type: "object" } },
		operationChanged: { schema: { type: "object" } }
	}
});
// src/types.ts
function x(e) {
	if (!e || typeof e != "object" || !("status" in e) || !("findings" in e) || !Array.isArray(e.findings)) throw Error("Invalid security state");
	return e;
}
// src/plan-view.ts
function S(e) {
	let { provider: t, auth: n, source: r, model: i } = e.codex;
	return `${t ? `${t.id} (${t.baseUrl})` : "OpenAI"}; auth: ${n === "api-key" ? `API key from environment variable ${t?.envKey ?? "OPENAI_API_KEY"} (name only)` : "dedicated ChatGPT sign-in"}; model: ${i}${r ? `; config ${r.path}${r.profile ? `, profile ${r.profile}` : ""}, SHA-256 ${r.digest}` : ""}${t ? "; gateway upstream routing is not verified" : ""}`;
}
function C(e) {
	return `${e.mock ? "MOCK SDK TEST: no model calls or uploads.\n" : ""}Repository: ${e.repository}\nScope: ${e.scopePaths.join(", ") || "whole repository"}\nScan prompt:\n${e.scanPrompt || "(none)"}\nContext files: ${e.contextFiles.map((e) => `${e.path} (${e.bytes} bytes, SHA-256 ${e.sha256})`).join("; ") || "(none)"}\nSDK settings: model ${e.settings.codex.model}, reasoning ${e.settings.codex.reasoningEffort}, Daybreak ${e.settings.codex.daybreak ? "on" : "off"}; mode ${e.settings.scan.mode} (${e.inputs.mode ? "per-scan choice" : "global default"}), access program ${e.settings.scan.cyberAccessProgram ?? "Codex default"}, estimated cost stop USD ${e.settings.scan.maxCostUsd}. Account/model/Daybreak access is not verified by these settings.\nGlobal config: ${e.globalConfigFile}${e.globalConfigDigest ? "" : " (not present)"}\nOnly this explicit prompt and these files are added as context; conversation history is not copied. Scoped paths guide the scan, not a filesystem sandbox.\n${e.mock ? "Synthetic SDK responses only." : `Repository source and listed context go to ${S(e.settings)}. Local results. USD ${e.settings.scan.maxCostUsd} estimated stop threshold, not a hard cap; in-flight usage may exceed it.`}`;
}
function w(e, t) {
	let { mode: n, ...r } = e;
	return t === "default" ? r : {
		...r,
		mode: t
	};
}
function T(e) {
	return !!e && (e.startsWith("/") || /^[A-Za-z]:[\\/]/.test(e));
}
function E(e, t = Date.now(), n) {
	let r = (e) => !!e?.plan && !e.planConsumed && Date.parse(e.plan.expiresAt) > t;
	if (n) return e?.drafts.find((e) => e.plan?.id === n && r(e));
	if (r(e?.preview)) return e.preview;
}
// src/scan-display.ts
var D = (e) => e.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || e || "Project";
function O(e) {
	return e.plan?.scanPrompt?.split("\n")[0].slice(0, 72) || (e.plan?.scopePaths.length ? e.plan.scopePaths.join(", ") : D(e.repository));
}
function k(e) {
	return e.plan?.scopePaths.join(", ") || "Whole repository";
}
function A(e) {
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
function j(e) {
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
function M(e) {
	return e.status === "running" && e.telemetry?.lifecycle?.status === "completed";
}
function N(e) {
	let t = e.telemetry?.lifecycle?.status;
	return e.status === "running" && t !== void 0 && t !== "running";
}
function P(e) {
	return e.status === "cancelled" ? "Scan cancelled" : e.status === "error" ? "Scan stopped" : e.status === "completed" ? "Scan complete" : M(e) ? "Finalizing results" : N(e) ? e.telemetry?.lifecycle?.status === "failed" ? "Finishing failed scan" : "Finishing cancelled scan" : e.deepProgress?.consolidating ? "Consolidating deep review" : A(e.telemetry?.phaseProgress?.phase ?? e.phase);
}
function F(e) {
	return e.status === "running" && !N(e) && !e.deepProgress?.consolidating;
}
function ee(e) {
	let { done: t, total: n, unit: r } = j(e);
	return n > 0 ? `${t} of ${n} ${r}` : t > 0 ? `${t} ${r} completed` : "Waiting for progress details";
}
function te(e) {
	let t = e.telemetry?.phaseProgress;
	return t?.reviews && t.reviews.total > 0 && t.files.total > 0 ? `Current phase only · ${t.files.done} of ${t.files.total} files` : "Current phase only";
}
function ne(e) {
	let t = e.deepProgress;
	return t ? `${t.completed} deep ${t.completed === 1 ? "pass" : "passes"} complete · ${t.active} active · cap ${t.maximum}` : "";
}
function re(e) {
	return N(e) && !M(e) ? `The SDK reported ${e.telemetry?.lifecycle?.status === "failed" ? "a scan failure" : "cancellation"}. Waiting for the final result; this is not a completed assessment.` : M(e) ? "Analysis complete. Waiting for the SDK’s final result and findings." : "Findings will appear when the scan finishes.";
}
var I = (e) => e > 0 && e < .01 ? "<0.01" : e.toFixed(2);
function ie(e) {
	let t = e.telemetry?.measurement;
	if (t) {
		let e = t.cost;
		if (!e || !Number.isFinite(e.baselineUsd)) return "Cost estimate unavailable";
		let n = `USD ${I(e.baselineUsd)}`;
		return t.coverage === "partial" ? `Partial estimate ${n}` : t.coverage === "unavailable" ? `Last estimate ${n} · coverage unavailable` : `Estimated usage ${n}`;
	}
	return e.estimatedCostUsd !== void 0 && Number.isFinite(e.estimatedCostUsd) ? `Estimated usage USD ${I(e.estimatedCostUsd)} · coverage unknown` : "Cost estimate unavailable";
}
function ae(e) {
	let t = e.telemetry?.measurement;
	if (!t) return "Usage coverage was not reported. Estimates are not invoices.";
	let n = t.missingThreadCount;
	return t.coverage === "partial" ? `Measured subtotal only${n ? `; ${n} ${n === 1 ? "session is" : "sessions are"} missing` : ""}. The full estimate may be higher.` : t.coverage === "unavailable" ? "The SDK could not establish usage coverage." : "All reported sessions are included. This is a usage estimate, not an invoice.";
}
function oe(e) {
	return [...e.telemetry?.activity ?? []].sort((e, t) => t.updatedAt.localeCompare(e.updatedAt));
}
function se(e) {
	let t = /* @__PURE__ */ new Set();
	return oe(e).filter((e) => {
		let n = e.worker ?? "coordinator";
		return !t.has(n) && (t.add(n), !0);
	});
}
function ce(e) {
	return e === void 0 ? "Coordinator" : `Worker ${e}`;
}
function le(e, t) {
	return e === "running" && (t.status !== "running" || N(t) || t.deepProgress?.consolidating) ? "Last reported running" : e === "running" ? "Working" : e === "failed" ? "Failed" : "Done";
}
function L(e) {
	let t = e.telemetry?.observedWorkers.length;
	return t ? `${t} worker ${t === 1 ? "session" : "sessions"} observed` : "";
}
function ue(e) {
	let t = e.workers;
	return t ? `${A(t.phase)}: ${t.started} started · ${t.planned} planned` : "";
}
function de(e) {
	let t = e.assessment?.returnedFindings;
	return t ? t.total === null ? "Returned finding counts unavailable" : [
		`${t.reportable ?? "Unknown"} reportable`,
		`${t.informational ?? "Unknown"} informational`,
		...t.unclassified ? [`${t.unclassified} unclassified`] : []
	].join(" · ") : `${e.findings.length} ${e.findings.length === 1 ? "finding" : "findings"} shown${e.skipped ? ` · ${e.skipped} other items omitted` : ""}`;
}
function fe(e) {
	let t = e.assessment?.coverage;
	return !t || t.source === "unavailable" ? "Coverage details unavailable" : [
		t.surfaces.total === null ? "Surfaces unavailable" : `${t.surfaces.total} review ${t.surfaces.total === 1 ? "surface" : "surfaces"}`,
		t.deferred.total === null ? "Deferred work unavailable" : `${t.deferred.total} deferred`,
		t.openQuestions.total === null ? "Open questions unavailable" : `${t.openQuestions.total} open ${t.openQuestions.total === 1 ? "question" : "questions"}`
	].join(" · ");
}
function pe(e) {
	let t = e.assessment?.repositoryFindings;
	return t?.available ? `${t.open ?? "Unknown"} open · ${t.closed ?? "Unknown"} closed · ${t.confirmedInLatestScan ?? "Unknown"} confirmed in this scan` : "Repository matching unavailable";
}
function me(e, t, n = Date.now()) {
	if (!e) return "";
	let r = Math.max(0, Math.floor(((t ? Date.parse(t) : n) - Date.parse(e)) / 1e3));
	return Number.isFinite(r) ? r < 60 ? `${r}s` : r < 3600 ? `${Math.floor(r / 60)}m ${r % 60}s` : `${Math.floor(r / 3600)}h ${Math.floor(r % 3600 / 60)}m` : "";
}
function R(e) {
	return e && typeof e == "object" && "message" in e ? String(e.message) : String(e);
}
function z(e) {
	return `${e.title}\nSeverity: ${e.severity} · ${e.cwe}\nLocation: ${e.path}:${e.line}\n\n${e.summary}\n\nEvidence:\n${e.evidence}\n\nSuggested remediation:\n${e.remediation}`;
}
// src/security-tui-operations.tsx
function he(r, o, c, d, p) {
	let m = r.client.rpc(b), [h, g] = f([]), [_, v] = f(), [y, x] = f(!1), [C, w] = f(!1), [T, E] = f(""), [D, O] = f({
		policy: !1,
		validation: !1,
		questionAnswers: !1
	}), k = !1, j = () => h().find((e) => e.operationId === _()) ?? h()[0], M = async () => {
		if (!(k || !D().policy && !D().validation)) try {
			let e = await m.operationList({}, { location: o });
			k || g(e.operations);
		} catch (e) {
			!k && y() && E(R(e));
		}
	};
	m.capabilities({}, { location: o }).then((e) => {
		k || O(e);
	}).catch(() => {});
	let N = async (e) => {
		if (!(k || C())) {
			w(!0), E("");
			try {
				await e(), k || await M();
			} catch (e) {
				k || E(R(e));
			} finally {
				k || w(!1);
			}
		}
	}, P = () => {
		x(!0), d();
	}, F = async (e) => {
		await r.ui.dialog.confirm({
			title: e.kind === "policy" ? "Review policy generation" : "Review source validation",
			message: `Repository: ${e.repository}\n${e.plan.path ? "Component: " + e.plan.path + "\n" : ""}Context: ${e.plan.contextFiles.map((e) => e.path).join(", ") || "No additional documents"}\n\n${e.plan.mock ? "Mock operation: no model calls or uploads." : `Repository source, the selected finding if any, and listed context go to ${S(e.plan.settings)}.\n${e.plan.costNotice}`}\n\n${e.kind === "policy" ? "Returns a draft only. Existing files stay unchanged." : "Static source assessment only. No exploit execution or patch application."}\n\nModel: ${e.plan.settings.codex.model} · ${e.plan.settings.codex.reasoningEffort} reasoning`,
			label: {
				confirm: e.plan.mock ? "Start mock operation" : e.kind === "validation" ? "Approve without cost ceiling" : "Approve and start",
				cancel: "Back"
			}
		}) && !k && await m.operationStart({
			operationId: e.operationId,
			approveOpenAIInference: !0,
			...e.kind === "validation" ? { approveUncappedValidation: !0 } : {}
		}, { location: o });
	};
	return {
		commands: [
			{
				id: "security.policy",
				title: "Security: draft a policy",
				group: "Security",
				palette: !0,
				enabled: () => D().policy,
				slash: { name: "security-policy" },
				run: async () => {
					P(), await N(async () => {
						let e = await p();
						if (!e || k) return;
						let t = await r.ui.dialog.prompt({
							title: "Policy component",
							description: `Target: ${e}. Repository-relative directory, or leave blank for the whole project. Preparation makes no model calls.`,
							placeholder: "src/api"
						});
						if (t === void 0 || k) return;
						let n = await m.operationPrepare({
							kind: "policy",
							repository: e,
							...t.trim() ? { path: t.trim() } : {}
						}, { location: o });
						v(n.operationId), await M(), await F(n);
					});
				}
			},
			{
				id: "security.validate",
				title: "Security: validate a finding",
				group: "Security",
				palette: !0,
				enabled: () => D().validation,
				slash: { name: "security-validate" },
				run: async () => {
					P(), await N(async () => {
						let e = c(), t, n;
						if (e?.findings.length) {
							let i = await r.ui.dialog.select({
								title: `Finding to validate · ${e.repository}`,
								options: e.findings.map((e) => ({
									title: `${e.severity.toUpperCase()} ${e.title}`,
									description: `${e.path}:${e.line}`,
									value: e.id
								}))
							});
							if (!i) return;
							t = z(e.findings.find((e) => e.id === i)), n = e.repository;
						} else {
							if (n = await p(), !n || k) return;
							t = await r.ui.dialog.prompt({
								title: "Finding to validate",
								description: `Target: ${n}. Describe the suspected issue, source location and evidence. Do not include secrets. Validation has no SDK cost ceiling.`
							});
						}
						if (!t?.trim() || k) return;
						let i = await m.operationPrepare({
							kind: "validation",
							repository: n,
							finding: t
						}, { location: o });
						v(i.operationId), await M(), await F(i);
					});
				}
			},
			{
				id: "security.operations",
				title: "Security: choose policy or validation work",
				group: "Security",
				palette: !0,
				enabled: () => D().policy || D().validation,
				slash: { name: "security-operations" },
				run: async () => {
					if (P(), await M(), !h().length) {
						await r.ui.dialog.alert({
							title: "Security operations",
							message: "No policy or validation work yet. Use /security-policy or /security-validate to prepare one."
						});
						return;
					}
					let e = await r.ui.dialog.select({
						title: "Choose an operation",
						current: j()?.operationId,
						options: h().map((e) => ({
							title: `${e.kind === "policy" ? "Policy" : "Validation"} · ${A(e.status)}`,
							description: `${e.repository} · ${e.operationId.slice(0, 8)}`,
							value: e.operationId
						}))
					});
					e && !k && v(e);
				}
			},
			{
				id: "security.operationStart",
				title: "Security: review selected prepared operation",
				group: "Security",
				palette: !0,
				enabled: () => j()?.status === "prepared",
				slash: { name: "security-operation-start" },
				run: async () => {
					let e = j();
					e && await N(() => F(e));
				}
			},
			{
				id: "security.answer",
				title: "Security: answer policy questions",
				group: "Security",
				palette: !0,
				enabled: () => !!j()?.question,
				slash: { name: "security-answer" },
				run: async () => {
					let e = j(), t = e?.question;
					e && t && (P(), await N(async () => {
						let n = await r.ui.dialog.prompt({
							title: "Answer security questions",
							description: t.questions.map((e, t) => `${t + 1}. ${e}`).join("\n") + `\n\nAnswer each question or state what is unknown. Your answer will be sent to the already-approved route: ${S(e.plan.settings)}. Do not include secrets.`
						});
						n?.trim() && !k && await m.operationAnswer({
							operationId: e.operationId,
							questionId: t.id,
							answer: n
						}, { location: o });
					}));
				}
			},
			{
				id: "security.operationCancel",
				title: "Security: cancel selected operation",
				group: "Security",
				palette: !0,
				enabled: () => [
					"prepared",
					"running",
					"awaiting_answers"
				].includes(j()?.status ?? ""),
				slash: { name: "security-operation-cancel" },
				run: async () => {
					let e = j();
					e && await N(() => m.operationCancel({ operationId: e.operationId }, { location: o }));
				}
			},
			{
				id: "security.operationResult",
				title: "Security: read operation result",
				group: "Security",
				palette: !0,
				enabled: () => !!j()?.result,
				slash: { name: "security-operation-result" },
				run: async () => {
					let e = j()?.result;
					e && await r.ui.dialog.alert({
						title: e.kind === "policy" ? "Policy draft · not applied" : `Source assessment · ${A(e.disposition)}`,
						message: (e.kind === "policy" ? e.content + "\n\nReview notes:\n" + e.reviewNotes.join("\n") : e.report) + "\n\n" + (e.truncated ? "Preview truncated. Read full local SDK artifacts." : e.kind === "policy" ? "No repository files changed." : "Static assessment, not runtime reproduction.")
					});
				}
			}
		],
		view: () => (() => {
			var r = t("box"), o = t("text");
			return a(r, o), s(r, "flexDirection", "column"), s(r, "gap", 1), a(o, n("/security-operations: choose work · /security: return to scans")), i(r, e(u, {
				get when() {
					return T();
				},
				get children() {
					var e = t("text");
					return s(e, "fg", "#ffb3b3"), i(e, T), e;
				}
			}), null), i(r, e(u, {
				get when() {
					return j();
				},
				get fallback() {
					return (() => {
						var e = t("text");
						return a(e, n("Prepare a policy draft with /security-policy or assess a finding with /security-validate.")), e;
					})();
				},
				children: (r) => (() => {
					var o = t("box"), c = t("text"), d = n(" · "), f = t("text"), p = n("Target: "), m = t("text");
					return a(o, c), a(o, f), a(o, m), s(o, "flexDirection", "column"), s(o, "gap", 1), a(c, d), s(c, "fg", "#9be4c6"), i(c, () => r().kind === "policy" ? "Policy draft" : "Finding validation", d), i(c, () => A(r().status), null), a(f, p), i(f, () => r().repository, null), i(m, () => r().phase), i(o, e(u, {
						get when() {
							return r().status === "prepared";
						},
						get children() {
							var e = t("text");
							return a(e, n("/security-operation-start to review this operation before starting.")), e;
						}
					}), null), i(o, e(u, {
						get when() {
							return r().question;
						},
						children: (r) => (() => {
							var o = t("box"), c = t("text");
							return a(o, c), s(o, "flexDirection", "column"), a(c, n("Your input is needed. /security-answer to respond.")), i(o, e(l, {
								get each() {
									return r().questions;
								},
								children: (e) => (() => {
									var n = t("text");
									return i(n, e), n;
								})()
							}), null), o;
						})()
					}), null), i(o, e(u, {
						get when() {
							return r().estimatedCostUsd !== void 0;
						},
						get children() {
							var e = t("text"), o = n("Estimated usage: USD ");
							return a(e, o), i(e, () => (r().estimatedCostUsd ?? 0).toFixed(2), null), e;
						}
					}), null), i(o, e(u, {
						get when() {
							return r().error;
						},
						get children() {
							var e = t("text");
							return s(e, "fg", "#ffb3b3"), i(e, () => r().error), e;
						}
					}), null), i(o, e(u, {
						get when() {
							return r().result;
						},
						get children() {
							var e = t("text"), o = n("/security-operation-result to read ");
							return a(e, o), i(e, () => r().kind === "policy" ? "the draft. No files have been applied." : "the static assessment. This is not runtime reproduction.", null), e;
						}
					}), null), i(o, e(u, {
						get when() {
							return r().status === "running" || r().status === "awaiting_answers";
						},
						get children() {
							var e = t("text");
							return a(e, n("/security-operation-cancel stops only this operation.")), e;
						}
					}), null), o;
				})()
			}), null), r;
		})(),
		visible: y,
		close: () => x(!1),
		refresh: M,
		questionCount: () => h().filter((e) => e.status === "awaiting_answers").length,
		dispose: () => {
			k = !0;
		}
	};
}
// src/tui.tsx
var B = c.define({
	id: "gill.security.tui",
	setup(c) {
		let [m, h] = f(), [g, _] = f(), [v, y] = f(!1), [D, A] = f(""), [j, M] = f(!1), [N, I] = f(Date.now()), [z, B] = f({}), [ge, V] = f(), H = !1, U = !1, W = c.location ?? c.data.location.default(), G = c.client.rpc(b), K = () => m()?.runs ?? [], q = () => K().find((e) => e.runId === g()) ?? K()[0];
		d(p(() => q()?.runId, () => y(!1)));
		let J = () => c.ui.router.navigate({
			type: "plugin",
			name: "security"
		}), Y = T(c.location?.directory) ? c.location.directory : void 0, X = async (e = Y) => {
			let t = await c.ui.dialog.prompt({
				title: "Target repository",
				description: "Choose an absolute local path. This changes only the next task, not the history workspace or global settings.",
				value: e,
				placeholder: "/path/to/project"
			});
			if (!(t === void 0 || H)) {
				if (!T(t.trim())) throw Error("Choose an absolute local repository path before preparing a task.");
				return t.trim();
			}
		}, Z = he(c, W, q, J, async () => Y ?? X()), Q = () => K().filter((e) => e.status === "running").length, $ = async () => {
			if (!(H || U)) {
				U = !0;
				try {
					let e = await G.list({}, { location: W });
					H || h(e);
				} catch (e) {
					H || A(R(e));
				} finally {
					U = !1;
				}
			}
		}, _e = (o) => new Promise((l) => {
			let d = !1, p = (e) => {
				d || (d = !0, l(e), c.ui.dialog.clear());
			}, m = () => {
				let [l, d] = f(!1);
				return c.keymap.layer(() => ({
					mode: "global",
					priority: 1e3,
					commands: [
						{
							bind: "ctrl+y",
							title: "Approve and start",
							run: () => p(!0)
						},
						{
							bind: "ctrl+d",
							title: "Toggle advanced details",
							run: () => d((e) => !e)
						},
						{
							bind: "escape",
							title: "Back without starting",
							run: () => p(!1)
						}
					]
				})), (() => {
					var d = t("box"), f = t("text"), p = t("scrollbox"), m = t("box"), h = t("text"), g = n("Repository: "), _ = t("text"), v = n("Scope: "), y = n(" · Depth: "), b = t("text"), x = n("Ctrl+Y: "), w = n(" · Ctrl+D: "), T = n(" settings · Esc: back");
					return a(d, f), a(d, p), a(d, b), s(d, "flexDirection", "column"), s(d, "padding", 1), s(d, "gap", 1), s(f, "fg", "#9be4c6"), i(f, () => o.mock ? "Review mock scan" : "Review this scan"), a(p, m), s(p, "focused", !0), a(m, h), a(m, _), s(m, "flexDirection", "column"), s(m, "gap", 1), a(h, g), i(h, () => o.repository, null), a(_, v), a(_, y), i(_, () => o.scopePaths.join(", ") || "Whole repository", y), i(_, () => o.settings.scan.mode, null), i(m, e(u, {
						get when() {
							return o.scanPrompt;
						},
						get children() {
							var e = t("text"), r = n("Focus: ");
							return a(e, r), i(e, () => o.scanPrompt, null), e;
						}
					}), null), i(m, e(u, {
						get when() {
							return o.contextFiles.length;
						},
						get children() {
							var e = t("text"), r = n("Context: ");
							return a(e, r), i(e, () => o.contextFiles.map((e) => e.path).join(", "), null), e;
						}
					}), null), i(m, e(u, {
						get when() {
							return !o.mock;
						},
						get fallback() {
							return (() => {
								var e = t("text");
								return a(e, n("Mock SDK responses only. No model calls or source uploads.")), e;
							})();
						},
						get children() {
							return [
								(() => {
									var e = t("text"), r = n("Repository source and listed context will be sent to"), s = n(". Results stay local.");
									return a(e, r), a(e, s), i(e, () => S(o.settings), s), e;
								})(),
								(() => {
									var e = t("text"), r = n("Estimated stop: USD "), s = n(" for this scan. Not a hard cap; in-flight usage may exceed it.");
									return a(e, r), a(e, s), i(e, () => o.settings.scan.maxCostUsd, s), e;
								})(),
								(() => {
									var e = t("text");
									return a(e, n("Conversation history is not copied. Scope guides the scan; it is not a filesystem sandbox.")), e;
								})()
							];
						}
					}), null), i(m, e(u, {
						get when() {
							return l();
						},
						get children() {
							var e = t("text");
							return i(e, () => C(o)), e;
						}
					}), null), a(b, x), a(b, w), a(b, T), i(b, () => o.mock ? "start mock scan" : "approve and start", w), i(b, () => l() ? "hide" : "show", T), r((e) => s(p, "height", Math.max(6, Math.min(22, c.renderer.height - 12)), e)), d;
				})();
			};
			c.ui.dialog.show(() => e(m, {}), () => {
				d || (d = !0, l(!1));
			}), c.ui.dialog.set({
				size: "xlarge",
				centered: !0
			});
		}), ve = async () => {
			if (!(j() || H)) {
				M(!0), A("");
				try {
					if (await $(), Q() >= (m()?.maxConcurrent ?? 2)) throw Error("All scan slots are in use. Start another scan after one finishes.");
					let e = {};
					if (!m()?.engine?.startsWith("local-patterns")) {
						let t = E(m(), Date.now(), ge());
						if (!t) {
							let e = z().repository || Y || await X();
							if (!e || H) return;
							t = x(await G.prepare({
								...z(),
								repository: e
							}, { location: W }));
						}
						let n = t.plan;
						if (!n) throw Error("No scan preview returned. Nothing was started.");
						if (!await _e(n) || H) return;
						e = {
							planId: n.id,
							approveOpenAIInference: !0
						};
					}
					let t = x(await G.start(e, { location: W }));
					H || (_(t.runId), B({}), V(void 0), await $());
				} catch (e) {
					H || A(R(e));
				} finally {
					H || M(!1);
				}
			}
		}, ye = async () => {
			if (await $(), !K().length) {
				await c.ui.dialog.alert({
					title: "Scans",
					message: "No scans yet. Use /security-scan to review and start one."
				});
				return;
			}
			let e = await c.ui.dialog.select({
				title: "Scans recorded in this workspace",
				current: q()?.runId,
				options: K().map((e) => ({
					title: `${e.status.toUpperCase()} · ${O(e)}`,
					description: `${e.repository} · ${k(e)} · ${e.mode ?? "fixture"} · ${e.runId?.slice(0, 8)}`,
					value: e.runId
				}))
			});
			e && !H && _(e);
		}, be = async () => {
			let e = q();
			if (!e?.runId || e.status !== "running") await c.ui.dialog.alert({
				title: "Cancel scan",
				message: "Select a running scan with /security-scans first."
			});
			else if (!j()) {
				M(!0), A("");
				try {
					await G.cancel({ runId: e.runId }, { location: W }), await $();
				} catch (e) {
					H || A(R(e));
				} finally {
					H || M(!1);
				}
			}
		};
		$();
		let xe = setInterval(() => {
			I(Date.now()), $(), Z.refresh();
		}, 1500), Se = c.ui.router.register({
			name: "security",
			render: () => (() => {
				var c = t("scrollbox"), d = t("box"), f = t("text"), p = t("text"), h = n("History workspace: "), g = t("text"), _ = t("text");
				return a(c, d), s(c, "height", "100%"), s(c, "focused", !0), a(d, f), a(d, p), a(d, g), a(d, _), s(d, "flexDirection", "column"), s(d, "padding", 1), s(d, "gap", 1), a(f, n("Security")), s(f, "fg", "#9be4c6"), a(p, h), s(p, "fg", "#b5b5b5"), i(p, () => W.directory, null), i(d, e(u, {
					when: !Y,
					get children() {
						var e = t("text");
						return a(e, n("No active local workspace verified. Choose a target before preparing work.")), e;
					}
				}), g), i(g, (() => {
					var e = o(() => !!Q());
					return () => e() ? `${Q()} of ${m()?.maxConcurrent ?? 2} scans running` : "Review code, then follow each scan here.";
				})()), a(_, n("/security-scan: new · /security-scans: switch · Ctrl+D: details · Esc: back")), s(_, "fg", "#b5b5b5"), i(d, e(u, {
					get when() {
						return Z.questionCount();
					},
					get children() {
						var e = t("text"), r = n(" operation(s) need your answer. /security-operations to select.");
						return a(e, r), s(e, "fg", "#9be4c6"), i(e, () => Z.questionCount(), r), e;
					}
				}), null), i(d, e(u, {
					get when() {
						return Z.visible();
					},
					fallback: [],
					get children() {
						return Z.view();
					}
				}), null), i(d, e(u, {
					get when() {
						return !Z.visible();
					},
					get children() {
						return [
							e(u, {
								get when() {
									return D();
								},
								get children() {
									var e = t("text");
									return s(e, "fg", "#ffb3b3"), i(e, D), e;
								}
							}),
							e(u, {
								get when() {
									return m()?.historyError;
								},
								get children() {
									var e = t("text");
									return s(e, "fg", "#ffb3b3"), i(e, () => m()?.historyError), e;
								}
							}),
							e(u, {
								get when() {
									return o(() => !!v())() && K().length;
								},
								get children() {
									var o = t("box"), c = t("text"), u = t("text");
									return a(o, c), a(o, u), s(o, "flexDirection", "column"), s(o, "gap", 0), a(c, n("Global settings share defaults, not a target or combined history.")), a(u, n("RECENT SCANS IN THIS WORKSPACE")), i(o, e(l, {
										get each() {
											return K().slice(0, 6);
										},
										children: (e) => (() => {
											var o = t("text"), c = n(" · "), l = n(" · "), u = n(" · "), d = n(" · ");
											return a(o, c), a(o, l), a(o, u), a(o, d), i(o, () => e.runId === q()?.runId ? "> " : "  ", c), i(o, () => e.status.toUpperCase(), c), i(o, () => O(e), l), i(o, () => e.mode ?? "fixture", u), i(o, () => e.runId?.slice(0, 8), d), i(o, () => e.repository, null), r((t) => s(o, "fg", e.runId === q()?.runId ? "#9be4c6" : void 0, t)), o;
										})()
									}), null), o;
								}
							}),
							e(u, {
								get when() {
									return q();
								},
								get fallback() {
									return (() => {
										var e = t("text");
										return a(e, n("No scans yet. Preparation makes no model calls. Each scan starts only after approval.")), e;
									})();
								},
								children: (c) => (() => {
									var d = t("box"), f = t("text"), p = t("text"), m = n("Target: "), h = t("text"), g = n(" · "), _ = t("text"), y = t("b"), b = t("text"), x = t("text"), S = n("Ctrl+D: "), C = n(" activity, coverage and scan details");
									return a(d, f), a(d, p), a(d, h), a(d, _), a(d, b), a(d, x), s(d, "flexDirection", "column"), s(d, "gap", 1), s(f, "fg", "#9be4c6"), i(f, () => O(c())), a(p, m), s(p, "fg", "#b5b5b5"), i(p, () => c().repository, null), a(h, g), s(h, "fg", "#b5b5b5"), i(h, () => k(c()), g), i(h, () => c().mode ?? "Fixture pattern checks", null), a(_, y), i(y, () => P(c())), i(_, e(u, {
										get when() {
											return me(c().startedAt, c().finishedAt, N());
										},
										children: (e) => [" · ", o(e)]
									}), null), i(d, e(u, {
										get when() {
											return F(c());
										},
										get children() {
											var e = t("text"), r = n(" · ");
											return a(e, r), i(e, () => ee(c()), r), i(e, () => te(c()), null), e;
										}
									}), b), i(d, e(u, {
										get when() {
											return c().status === "running";
										},
										get children() {
											return [(() => {
												var e = t("text");
												return i(e, () => re(c())), e;
											})(), (() => {
												var e = t("text");
												return a(e, n("/security-cancel: stop this scan")), s(e, "fg", "#b5b5b5"), e;
											})()];
										}
									}), b), i(b, () => ie(c())), i(d, e(u, {
										get when() {
											return c().error;
										},
										get children() {
											var e = t("text");
											return s(e, "fg", "#ffb3b3"), i(e, () => c().error), e;
										}
									}), x), i(d, e(u, {
										get when() {
											return c().status === "cancelled";
										},
										get children() {
											var e = t("text");
											return a(e, n("Cancelled. This scan is incomplete, not a clean result.")), e;
										}
									}), x), i(d, e(u, {
										get when() {
											return c().status === "completed";
										},
										get children() {
											var e = t("text"), r = t("b"), o = n(" · /security-findings: evidence");
											return a(e, r), a(e, o), i(r, () => de(c())), e;
										}
									}), x), i(d, e(l, {
										get each() {
											return c().findings.slice(0, 5);
										},
										children: (e) => (() => {
											var o = t("text"), c = t("span"), l = n(" · ");
											return a(o, c), a(o, l), i(c, () => e.severity.toUpperCase()), i(o, () => e.title, null), r((t) => s(c, "style", { fg: e.severity === "high" || e.severity === "critical" ? "#ffb3b3" : "#ebc28c" }, t)), o;
										})()
									}), x), i(d, e(u, {
										get when() {
											return o(() => c().status === "completed")() && !c().findings.length;
										},
										get children() {
											var e = t("text");
											return a(e, n("No findings does not guarantee security. Check coverage in details.")), s(e, "fg", "#b5b5b5"), e;
										}
									}), x), a(x, S), a(x, C), s(x, "fg", "#b5b5b5"), i(x, () => v() ? "hide" : "show", C), i(d, e(u, {
										get when() {
											return v();
										},
										get children() {
											return [
												(() => {
													var e = t("text");
													return a(e, n("SCAN DETAILS")), e;
												})(),
												(() => {
													var e = t("text");
													return i(e, () => c().repository), e;
												})(),
												(() => {
													var e = t("text"), r = n("Run: ");
													return a(e, r), i(e, () => c().runId, null), e;
												})(),
												e(u, {
													get when() {
														return c().telemetry?.measurement?.coverage !== "complete";
													},
													get children() {
														var e = t("text");
														return i(e, () => ae(c())), e;
													}
												}),
												e(u, {
													get when() {
														return L(c());
													},
													get children() {
														var e = t("text");
														return i(e, () => L(c())), e;
													}
												}),
												e(u, {
													get when() {
														return ue(c());
													},
													get children() {
														var e = t("text");
														return i(e, () => ue(c())), e;
													}
												}),
												e(u, {
													get when() {
														return o(() => c().status === "running")() && c().deepProgress;
													},
													get children() {
														var e = t("text"), r = n(". The cap is not a completion target.");
														return a(e, r), i(e, () => ne(c()), r), e;
													}
												}),
												e(u, {
													get when() {
														return c().status === "completed";
													},
													get children() {
														return [
															(() => {
																var e = t("text");
																return i(e, () => fe(c())), e;
															})(),
															(() => {
																var e = t("text"), r = n("Repository matching: ");
																return a(e, r), i(e, () => pe(c()), null), e;
															})(),
															(() => {
																var e = t("text");
																return a(e, n("Coverage is reported metadata, not proof of exhaustive review. See local SDK artifacts for details.")), e;
															})()
														];
													}
												}),
												(() => {
													var e = t("text");
													return a(e, n("ACTIVITY · latest reported")), e;
												})(),
												e(u, {
													get when() {
														return oe(c()).length;
													},
													get fallback() {
														return (() => {
															var e = t("text");
															return a(e, n("No detailed SDK activity recorded.")), e;
														})();
													},
													get children() {
														return e(l, {
															get each() {
																return se(c()).slice(0, 5);
															},
															children: (e) => (() => {
																var r = t("text"), o = n(" · "), s = n(" · ");
																return a(r, o), a(r, s), i(r, () => ce(e.worker), o), i(r, () => e.label, s), i(r, () => le(e.status, c()), null), r;
															})()
														});
													}
												}),
												e(u, {
													get when() {
														return c().events.length;
													},
													get children() {
														return [(() => {
															var e = t("text");
															return a(e, n("RECENT MILESTONES")), e;
														})(), e(l, {
															get each() {
																return [...c().events].reverse().slice(0, 3);
															},
															children: (e) => (() => {
																var r = t("text"), o = n(" · ");
																return a(r, o), i(r, () => new Date(e.time).toLocaleTimeString(), o), i(r, () => e.message, null), r;
															})()
														})];
													}
												})
											];
										}
									}), null), d;
								})()
							})
						];
					}
				}), null), c;
			})()
		});
		return c.keymap.layer(() => ({
			mode: "global",
			commands: [
				...Z.commands,
				{
					id: "security.details",
					title: "Security: toggle scan details",
					bind: "ctrl+d",
					group: "Security",
					palette: !0,
					slash: { name: "security-details" },
					enabled: () => {
						let e = c.ui.router.current();
						return !j() && !Z.visible() && !!q() && e.type === "plugin" && e.name === "security";
					},
					run: () => {
						y((e) => !e);
					}
				},
				{
					id: "security.back",
					title: "Security: return home",
					bind: "escape",
					enabled: () => {
						let e = c.ui.router.current();
						return !j() && e.type === "plugin" && e.name === "security";
					},
					run: () => c.ui.router.navigate({ type: "home" })
				},
				{
					id: "security.open",
					title: "Security: open scans",
					group: "Security",
					palette: !0,
					slash: { name: "security" },
					run: () => {
						Z.close(), J();
					}
				},
				{
					id: "security.scan",
					title: "Security: new scan",
					group: "Security",
					palette: !0,
					slash: { name: "security-scan" },
					run: async () => {
						Z.close(), J(), await ve();
					}
				},
				{
					id: "security.runs",
					title: "Security: choose a scan",
					group: "Security",
					palette: !0,
					slash: { name: "security-scans" },
					run: async () => {
						Z.close(), J(), await ye();
					}
				},
				{
					id: "security.cancel",
					title: "Security: cancel selected scan",
					group: "Security",
					palette: !0,
					slash: { name: "security-cancel" },
					run: be
				},
				{
					id: "security.target",
					title: "Security: choose next scan target",
					group: "Security",
					palette: !0,
					slash: { name: "security-target" },
					run: async () => {
						if (!j()) {
							M(!0), A("");
							try {
								let e = await X(Y);
								if (!e || H) return;
								let t = { repository: e };
								B(t), V("pending");
								let n = x(await G.prepare(t, { location: W }));
								if (!n.plan) throw Error("No scan preview returned. Nothing was started.");
								V(n.plan.id), await $(), Z.close(), J();
							} catch (e) {
								H || A(R(e));
							} finally {
								H || M(!1);
							}
						}
					}
				},
				{
					id: "security.mode",
					title: "Security: choose next scan depth",
					group: "Security",
					palette: !0,
					slash: { name: "security-mode" },
					run: async () => {
						if (!j()) {
							M(!0), A("");
							try {
								let e = await c.ui.dialog.select({
									title: "Depth for the next scan",
									current: z().mode ?? "default",
									options: [
										{
											title: "Global default",
											description: "Use the configured depth.",
											value: "default"
										},
										{
											title: "Standard",
											description: "Standard security scan.",
											value: "standard"
										},
										{
											title: "Deep",
											description: "Additional work; can take longer and cost more.",
											value: "deep"
										}
									]
								});
								if (!e || H) return;
								let t = E(m(), Date.now(), ge())?.plan, n = w(t?.inputs ?? z(), e);
								if (n.repository ||= t?.repository || Y || await X(), !n.repository || H) return;
								B(n), V("pending");
								let r = x(await G.prepare(n, { location: W }));
								if (!r.plan) throw Error("No scan preview returned. Nothing was started.");
								V(r.plan.id), await $(), J();
							} catch (e) {
								H || A(R(e));
							} finally {
								H || M(!1);
							}
						}
					}
				},
				{
					id: "security.findings",
					title: "Security: inspect selected scan findings",
					group: "Security",
					palette: !0,
					slash: { name: "security-findings" },
					run: async () => {
						let e = q(), t = e?.findings ?? [];
						if (!t.length) {
							await c.ui.dialog.alert({
								title: "Findings",
								message: e?.status === "running" ? "This scan is still running. Findings are available at completion." : e?.status === "completed" ? "No findings were reported by this completed scan. This is not a guarantee of security." : "Select a completed scan with /security-scans to inspect its findings."
							});
							return;
						}
						let n = await c.ui.dialog.select({
							title: "Findings",
							options: t.map((e) => ({
								title: `${e.severity.toUpperCase()} ${e.title}`,
								description: `${e.path}:${e.line}`,
								value: e.id
							}))
						}), r = t.find((e) => e.id === n);
						r && await c.ui.dialog.alert({
							title: r.title,
							message: `${r.path}:${r.line} · ${r.cwe}\n\n${r.summary}\n\n${r.evidence}\n\nSuggested next step: ${r.remediation}\n\nConfidence: ${r.confidence}`
						});
					}
				}
			]
		})), () => {
			H = !0, clearInterval(xe), Z.dispose(), Se();
		};
	}
});
export { B as default };
