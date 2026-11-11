Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:`Module`}});let e=require("solid-js/web"),t=require("@opencode/plugin/gui"),n=require("solid-js"),r=require("@opencode/plugin/rpc"),i=require("solid-js/store");var a={type:`object`,additionalProperties:!1},o={"security.setup":a},s={type:`object`,properties:{mode:{type:`string`,enum:[`standard`,`deep`],description:`Omit to use the configured default (standard). Deep is slower and costs more.`},repository:{type:`string`,description:`Repository path. Defaults to the current workspace. May be a folder holding several checkouts.`},scopePaths:{type:`array`,items:{type:`string`},description:`Paths relative to the repository. Omit to scan the whole repository.`},changes:{type:`string`,description:`Scan only a diff: "uncommitted" for staged and unstaged changes, or a base ref such as "origin/main" to compare with HEAD. Standard mode only; not combined with scopePaths.`},scanPrompt:{type:`string`,description:`What to focus on, plus architecture or threat assumptions the scan should know.`},contextFiles:{type:`array`,items:{type:`string`},description:`Context files or directories, relative to the repository or absolute (other checkouts are fine). A file may be any UTF-8 text (Markdown, Terraform, YAML, JSON), PDF or DOCX. A directory contributes all its text, PDF and DOCX files. No symlinks.`}},additionalProperties:!1},c={type:`object`,properties:{kind:{type:`string`,enum:[`policy`,`validation`,`fix`]},repository:{type:`string`},path:{type:`string`},contextFiles:{type:`array`,items:{type:`string`}},finding:{anyOf:[{type:`string`},{type:`object`}]}},required:[`kind`],additionalProperties:!1},l={type:`object`,properties:{operationId:{type:`string`}},required:[`operationId`],additionalProperties:!1},u={type:`string`},d={type:`object`},f=o,p=r.Rpc.define({id:`gill.security`,methods:{capabilities:{input:a,output:d,errors:f},prepare:{input:s,output:d,errors:f},start:{input:{type:`object`,properties:{planId:u},additionalProperties:!1},output:d,errors:f},list:{input:a,output:d,errors:f},status:{input:{type:`object`,properties:{runId:u,planId:u},additionalProperties:!1},output:d,errors:f},cancel:{input:{type:`object`,properties:{runId:u},additionalProperties:!1},output:d,errors:f},operationPrepare:{input:c,output:d,errors:f},operationStart:{input:l,output:d,errors:f},operationStatus:{input:l,output:d,errors:f},operationList:{input:a,output:d,errors:f},operationAnswer:{input:{type:`object`,properties:{operationId:u,questionId:u,answer:u},required:[`operationId`,`questionId`,`answer`],additionalProperties:!1},output:d,errors:f},operationCancel:{input:l,output:d,errors:f},operationResolve:{input:{type:`object`,properties:{operationId:u,action:{type:`string`,enum:[`apply`,`discard`]}},required:[`operationId`,`action`],additionalProperties:!1},output:d,errors:f},setup:{input:a,output:d,errors:f},signIn:{input:{type:`object`,properties:{device:{type:`boolean`}},additionalProperties:!1},output:d,errors:f},signInCancel:{input:a,output:d,errors:f},setProfile:{input:{type:`object`,properties:{profile:u},required:[`profile`],additionalProperties:!1},output:d,errors:f}},events:{changed:{schema:{type:`object`}},operationChanged:{schema:{type:`object`}}}}),m=e=>e.replace(/[\\/]+$/,``).split(/[\\/]/).at(-1)||e||`Project`;function h(e){return e.plan?.scanPrompt?.split(`
`)[0].slice(0,72)||(e.plan?.scopePaths.length?e.plan.scopePaths.join(`, `):m(e.repository))}function g(e){return e.changes?e.changes===`uncommitted`?`Uncommitted changes`:`Changes since ${e.changes}`:e.scopePaths.join(`, `)||`Whole repository`}function _(e){return e.plan?g(e.plan):`Whole repository`}function v(e){let t=e.replace(/\s*\((files|reviews)\)$/,``).replaceAll(`_`,` `),n={preflight:`Preparing scan`,discovery:`Reviewing source`,"attack path":`Reviewing attack paths`,"file review":`Reviewing source`,ranking:`Prioritizing findings`,validation:`Validating findings`,reporting:`Preparing report`};return n[t]?n[t]:t?t[0].toUpperCase()+t.slice(1):`Starting scan`}function y(e){let t=e.telemetry?.phaseProgress,n=t?t.reviews&&t.reviews.total>0?{...t.reviews,unit:`reviews`}:{...t.files,unit:`files`}:{...e.progress,unit:e.progress.unit??`files`};return{...n,done:Number.isFinite(n.done)?Math.max(0,n.done):0,total:Number.isFinite(n.total)?Math.max(0,n.total):0}}function b(e){return e.status===`running`&&e.telemetry?.lifecycle?.status===`completed`}function x(e){let t=e.telemetry?.lifecycle?.status;return e.status===`running`&&t!==void 0&&t!==`running`}function S(e){return e.status===`cancelled`?`Scan cancelled`:e.status===`error`?`Scan stopped`:e.status===`completed`?`Scan complete`:b(e)?`Finalizing results`:x(e)?e.telemetry?.lifecycle?.status===`failed`?`Finishing failed scan`:`Finishing cancelled scan`:e.deepProgress?.consolidating?`Consolidating deep review`:v(e.telemetry?.phaseProgress?.phase??e.phase)}function C(e){return e.status===`running`&&!x(e)&&!e.deepProgress?.consolidating}function w(e){let{done:t,total:n}=y(e);return C(e)&&n>0&&t<=n}function T(e){let{done:t,total:n,unit:r}=y(e);return n>0?`${t} of ${n} ${r}`:t>0?`${t} ${r} completed`:`Waiting for progress details`}function E(e){let t=e.telemetry?.phaseProgress;return t?.reviews&&t.reviews.total>0&&t.files.total>0?`Current phase only · ${t.files.done} of ${t.files.total} files`:`Current phase only`}function D(e){let t=e.deepProgress;return t?`${t.completed} deep ${t.completed===1?`pass`:`passes`} complete · ${t.active} active · cap ${t.maximum}`:``}function O(e){return x(e)&&!b(e)?`The SDK reported ${e.telemetry?.lifecycle?.status===`failed`?`a scan failure`:`cancellation`}. Waiting for the final result; this is not a completed assessment.`:b(e)?`Analysis complete. Waiting for the SDK’s final result and findings.`:`Findings will appear when the scan finishes.`}var k=e=>e>0&&e<.01?`<0.01`:e.toFixed(2);function A(e){let t=e.telemetry?.measurement;if(t){let e=t.cost;if(!e||!Number.isFinite(e.baselineUsd))return`Cost estimate unavailable`;let n=`USD ${k(e.baselineUsd)}`;return t.coverage===`partial`?`Partial estimate ${n}`:t.coverage===`unavailable`?`Last estimate ${n} · coverage unavailable`:`Estimated usage ${n}`}return e.estimatedCostUsd!==void 0&&Number.isFinite(e.estimatedCostUsd)?`Estimated usage USD ${k(e.estimatedCostUsd)} · coverage unknown`:`Cost estimate unavailable`}function ee(e){let t=e.telemetry?.measurement;if(!t)return`Usage coverage was not reported. Estimates are not invoices.`;let n=t.missingThreadCount;return t.coverage===`partial`?`Measured subtotal only${n?`; ${n} ${n===1?`session is`:`sessions are`} missing`:``}. The full estimate may be higher.`:t.coverage===`unavailable`?`The SDK could not establish usage coverage.`:`All reported sessions are included. This is a usage estimate, not an invoice.`}function j(e){let t=e.telemetry?.measurement?.cost?.range;return t?t.max===null?`USD ${k(t.min)} or more; upper estimate unavailable`:`USD ${k(t.min)}–${k(t.max)}`:``}function M(e){return[...e.telemetry?.activity??[]].sort((e,t)=>t.updatedAt.localeCompare(e.updatedAt))}function te(e){let t=new Set;return M(e).filter(e=>{let n=e.worker??`coordinator`;return!t.has(n)&&(t.add(n),!0)})}function ne(e){return e===void 0?`Coordinator`:`Worker ${e}`}function N(e,t){return e===`running`&&(t.status!==`running`||x(t)||t.deepProgress?.consolidating)?`Last reported running`:e===`running`?`Working`:e===`failed`?`Failed`:`Done`}function P(e){let t=e.telemetry?.observedWorkers.length;return t?`${t} worker ${t===1?`session`:`sessions`} observed`:``}function F(e){let t=e.workers;return t?`${v(t.phase)}: ${t.started} started · ${t.planned} planned`:``}function I(e){let t=e.telemetry?.lastReconnect;if(!t)return``;let n=t.reason?` · ${t.reason.replaceAll(`_`,` `)}`:``;return`Last connection retry: ${t.attempt} of ${t.maxAttempts}${n}`}function L(e){let t=e.telemetry?.trustedAccess;return t===`not_granted`?`Trusted Access for Cyber: not granted`:t===`unknown`?`Trusted Access for Cyber: not verified`:``}function R(e){return e.telemetry?.warnings?.targetChanged?`The repository changed during the scan`:``}function re(e){let t=e.assessment?.returnedFindings;return t?t.total===null?`Returned finding counts unavailable`:[`${t.reportable??`Unknown`} reportable`,`${t.informational??`Unknown`} informational`,...t.unclassified?[`${t.unclassified} unclassified`]:[]].join(` · `):`${e.findings.length} ${e.findings.length===1?`finding`:`findings`} shown${e.skipped?` · ${e.skipped} other items omitted`:``}`}function ie(e){let t=e.assessment?.coverage;return!t||t.source===`unavailable`?`Coverage details unavailable`:[t.surfaces.total===null?`Surfaces unavailable`:`${t.surfaces.total} review ${t.surfaces.total===1?`surface`:`surfaces`}`,t.deferred.total===null?`Deferred work unavailable`:`${t.deferred.total} deferred`,t.openQuestions.total===null?`Open questions unavailable`:`${t.openQuestions.total} open ${t.openQuestions.total===1?`question`:`questions`}`].join(` · `)}function ae(e){let t=e.assessment?.repositoryFindings;return t?.available?`${t.open??`Unknown`} open · ${t.closed??`Unknown`} closed · ${t.confirmedInLatestScan??`Unknown`} confirmed in this scan`:`Repository matching unavailable`}function oe(e){let t=e.assessment?.coverage;if(!t)return[];let n=[],r=(e,t,r)=>{n.push({label:e,value:t.total===null?`Not reported`:t.total===0?`None reported`:`${t.total} reported${t.omitted?`; ${t.omitted} not shown`:``}`});for(let e of t.items)n.push({label:``,value:r(e)})};return r(`Review surfaces`,t.surfaces,e=>`${e.label??`Unnamed surface`} · ${e.disposition.replaceAll(`_`,` `)}${e.riskArea?` · ${e.riskArea}`:``}`),r(`Explicit exclusions`,t.explicitExclusions,e=>`${e.pattern??`Unspecified scope`}${e.reason?` · ${e.reason}`:``}`),r(`Deferred work`,t.deferred,e=>`${e.reason??`No reason reported`}${e.paths.items.length?` · ${e.paths.items.join(`, `)}`:``}`),r(`Resolved deferred work`,t.resolvedDeferred,e=>e.reason??`Resolution recorded`),r(`Open questions`,t.openQuestions,e=>e.question??`Question details unavailable`),r(`Included scope`,t.scopeIncludePaths,e=>e),r(`Excluded scope`,t.scopeExcludePaths,e=>e),r(`Review-excluded paths`,t.reviewExcludedPaths,e=>e),r(`Limitations`,t.limitations,e=>e),n}function z(e,t,n=Date.now()){if(!e)return``;let r=Math.max(0,Math.floor(((t?Date.parse(t):n)-Date.parse(e))/1e3));return Number.isFinite(r)?r<60?`${r}s`:r<3600?`${Math.floor(r/60)}m ${r%60}s`:`${Math.floor(r/3600)}h ${Math.floor(r%3600/60)}m`:``}function B(e){return e.split(`
`).map(e=>e.trim()).filter(Boolean)}function V(e){return e&&typeof e==`object`&&`message`in e?String(e.message):String(e)}function se(e){return`${e.title}\nSeverity: ${e.severity} · ${e.cwe}\nLocation: ${e.path}:${e.line}\n\n${e.summary}\n\nEvidence:\n${e.evidence}\n\nSuggested remediation:\n${e.remediation}`}function ce(e){let t=e=>(e?.match(/\d+/g)??[]).map(Number),[n=0,r=0]=t(e.node),[i=0,a=0]=t(e.python),o=e=>e?`found ${e}`:`not found`;return[...n===24||n===26||n===22&&r>=20?[]:[`Node 22.20+, 24 or 26 (${o(e.node)})`],...i>3||i===3&&a>=10?[]:[`Python 3.10+ (${o(e.python)})`]]}function le(e){return{verified:`Fix verified`,no_change:`No change needed`,blocked:`Fix blocked`,failed:`Fix failed verification`}[e]??`Fix`}function ue(e){if(!e)return``;if(e.pending)return e.pending.code?`Enter code ${e.pending.code} at ${e.pending.url}`:`Finish signing in in your browser: ${e.pending.url}`;let t={"signed-in":``,shared:`Using your Codex CLI sign-in; sign in here to keep the two separate`,needed:`Not signed in to Codex Security`}[e.state];return[e.error,t].filter(Boolean).join(` · `)}function de(e){return e===void 0?`No cost limit is configured.`:`Stops at an estimated USD ${e}. This is an estimate, not a billing cap.`}function H(e){let{provider:t,baseUrl:n,auth:r,model:i,reasoningEffort:a}=e.codex;return`${t}${n?` (${n})`:``} · ${i}, ${a} reasoning · ${r}`}function fe(e){if(e.server.id===`sidecar`&&pe(e.directory)&&e.location?.directory===e.directory)return e.directory}function pe(e){return!!e&&(e.startsWith(`/`)||/^[A-Za-z]:[\\/]/.test(e))}function me(e,t=Date.now(),n){let r=e=>!!e?.plan&&!e.planConsumed&&Date.parse(e.plan.expiresAt)>t;if(n)return e?.drafts.find(e=>e.plan?.id===n&&r(e));if(r(e?.preview))return e.preview}function U(e){let{provider:t,baseUrl:n}=e.codex;return`${t}${n?` (${n})`:``}`}function W(e){if(!e||typeof e!=`object`||!(`status`in e)||!(`findings`in e)||!Array.isArray(e.findings))throw Error(`Invalid security state`);return e}function he(e){if(!e||typeof e!=`object`||!(`runs`in e)||!Array.isArray(e.runs))throw Error(`Could not read scan history. Update the server plugin and reopen Security.`);let t=e;return{...t,runs:t.runs.map(W),drafts:(t.drafts??[]).map(W),maxConcurrent:t.maxConcurrent??2}}function ge(e){let t=Array.isArray(e)?e:e?.operations;if(!Array.isArray(t))throw Error(`Could not read policy and validation operations.`);return t}function G(e){let t,n=!1;return function(){return t?(n=!0,t):(t=(async()=>{try{do n=!1,await e();while(n)}finally{t=void 0}})(),t)}}function _e(e){let[t,r]=(0,i.createStore)({runs:[],drafts:[],maxConcurrent:2}),[a,o]=(0,i.createStore)({list:[]}),[s,c]=(0,n.createSignal)(!1),[l,u]=(0,n.createSignal)(``),[d,f]=(0,n.createSignal)(Date.now()),p=!1,m=G(async()=>{try{let t=he(await e.port.list());if(p)return;r((0,i.reconcile)(t,{key:`runId`,merge:!0})),f(Date.now()),u(``),c(!0)}catch(e){p||u(V(e))}}),h=G(async()=>{if(e.operations)try{let t=ge(await e.operations.list());p||o(`list`,(0,i.reconcile)(t,{key:`operationId`,merge:!0}))}catch{}}),g=()=>Promise.all([m(),h()]).then(()=>{}),_=e.port.subscribe?.(e=>void(e===`changed`?m():h()));g();let v=setInterval(()=>void g(),e.fallbackMs??3e4),y=(0,n.createMemo)(()=>t.runs.filter(e=>e.status===`running`).length),b=(0,n.createMemo)(()=>a.list.some(e=>e.status===`running`||e.status===`awaiting_answers`));return(0,n.createEffect)(()=>{if(!y()&&!b())return;f(Date.now());let e=setInterval(()=>f(Date.now()),1e3);(0,n.onCleanup)(()=>clearInterval(e))}),(0,n.onCleanup)(()=>{p=!0,clearInterval(v),_?.()}),{catalog:t,operations:()=>a.list,loaded:s,connectionError:l,now:d,running:y,refresh:g,refreshScans:m,refreshOperations:h}}var K=e=>e?new Date(e).toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`}):``,q=e=>new Date(e).toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`,second:`2-digit`});function J(e){return{idle:`Ready`,prepared:`Ready to start`,running:`Running`,awaiting_answers:`Needs your answer`,completed:`Done`,cancelled:`Cancelled`,error:`Failed`}[e]??e}function ve(e){return{reportable:`Confirmed in source`,suppressed:`Not confirmed`,not_applicable:`Not applicable`,deferred:`Undecided: needs more context`}[e]??e.replaceAll(`_`,` `)}var ye=(0,e.template)(`<p class="gs-muted gs-wrap">`),be=(0,e.template)(`<p class=gs-alert role=alert>`),xe=(0,e.template)(`<p>Approving sends repository source<!> and any context files to <!>.`),Se=(0,e.template)(`<p><strong>`),Ce=(0,e.template)(`<p>You get a draft to review. Nothing is written to the repository.`),we=(0,e.template)(`<p>The fix is written in a copy of the last commit. Your files change only if you apply the diff.`),Te=(0,e.template)(`<div class=gs-approval><details class=gs-disclosure><summary>Model and route</summary><p> · <!> reasoning</p><p>`),Ee=(0,e.template)(`<p class="gs-note gs-danger">This preview has expired. Prepare it again.`),De=(0,e.template)(`<div class=gs-actions><button class="gs-button gs-primary">`),Oe=(0,e.template)(`<p class="gs-muted gs-tabular"> · `),ke=(0,e.template)(`<div class=gs-actions><button class=gs-button>Cancel`),Ae=(0,e.template)(`<div class=gs-operation><div class=gs-operation-head><strong></strong><span class=gs-status>`),je=(0,e.template)(`<p>Mock operation: synthetic results, no model calls.`),Y=(0,e.template)(`<p class=gs-report>`),Me=(0,e.template)(`<pre aria-label="Proposed change">`),Ne=(0,e.template)(`<p class=gs-note>Diff truncated here; applying uses the whole change.`),Pe=(0,e.template)(`<div class=gs-actions><button class="gs-button gs-primary">Apply to working tree</button><button class=gs-button>Discard</button><span class=gs-muted>Applying does not commit.`),Fe=(0,e.template)(`<div class=gs-result><p class=gs-disposition>`),Ie=(0,e.template)(`<p class=gs-muted>No files were changed.`),Le=(0,e.template)(`<p class=gs-note>Preview truncated. The full result is in the local SDK output.`),Re=(0,e.template)(`<div class=gs-result>`),ze=(0,e.template)(`<p class=gs-disposition> · static source review`),Be=(0,e.template)(`<p class=gs-muted>Draft for <!>. Not written to disk; copy what you want to keep.`),Ve=(0,e.template)(`<pre>`),He=(0,e.template)(`<p class=gs-muted>`),Ue=(0,e.template)(`<form class="gs-form gs-questions"><h4>Questions from the policy draft</h4><ol></ol><label>Your answer<textarea aria-label="Answer security questions"maxlength=8000 required></textarea><span class=gs-help>Answer each question, or say you don't know. Sent to <!>.</span></label><div class=gs-actions><button class="gs-button gs-primary"type=submit>Send answer`),We=(0,e.template)(`<li>`),X=e=>e.disposition;function Z(t){let[r,i]=(0,n.createSignal)(!1),[a,o]=(0,n.createSignal)(``),s=()=>t.op,c=()=>s().kind===`validation`,l=()=>s().kind===`fix`,u=()=>s().status===`running`||s().status===`awaiting_answers`,d=()=>Date.parse(s().plan.expiresAt)<=t.store.now(),f=async e=>{if(!r()){i(!0),o(``);try{await e(),await t.store.refreshOperations()}catch(e){o(V(e))}finally{i(!1)}}},p=()=>f(()=>t.port.start({operationId:s().operationId}));return(()=>{var i=Ae(),o=i.firstChild.firstChild,m=o.nextSibling;return(0,e.insert)(o,()=>({policy:`Policy draft`,validation:`Validation`,fix:`Fix`})[s().kind]),(0,e.insert)(m,()=>J(s().status)),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return!t.compact},get children(){var t=ye();return(0,e.insert)(t,()=>s().repository,null),(0,e.insert)(t,(()=>{var t=(0,e.memo)(()=>!!(s().plan.path&&s().plan.path!==`.`));return()=>t()?` / ${s().plan.path}`:``})(),null),t}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return a()||s().error},get children(){var t=be();return(0,e.insert)(t,()=>a()||s().error),t}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return s().status===`prepared`},get children(){return[(()=>{var t=Te(),r=t.firstChild,i=r.firstChild.nextSibling,a=i.firstChild,o=a.nextSibling;o.nextSibling;var u=i.nextSibling;return(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return!s().plan.mock},get fallback(){return je()},get children(){return[(()=>{var t=xe(),n=t.firstChild.nextSibling,r=n.nextSibling.nextSibling;return r.nextSibling,(0,e.insert)(t,()=>c()||l()?`, this finding`:``,n),(0,e.insert)(t,()=>U(s().plan.settings),r),t})(),(()=>{var t=Se(),n=t.firstChild;return(0,e.insert)(n,()=>s().plan.costNotice),t})(),(0,e.createComponent)(n.Show,{get when(){return s().kind===`policy`},get children(){return Ce()}}),(0,e.createComponent)(n.Show,{get when(){return l()},get children(){return we()}})]}}),r),(0,e.insert)(i,()=>s().plan.settings.codex.model,a),(0,e.insert)(i,()=>s().plan.settings.codex.reasoningEffort,o),(0,e.insert)(u,()=>H(s().plan.settings)),t})(),(0,e.createComponent)(n.Show,{get when(){return d()},get children(){return Ee()}}),(()=>{var t=De(),n=t.firstChild;return n.$$click=()=>void p(),(0,e.insert)(n,(()=>{var t=(0,e.memo)(()=>!!r());return()=>t()?`Starting…`:s().plan.mock?`Start mock run`:`Approve and start`})()),(0,e.effect)(()=>n.disabled=r()||d()),t})()]}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return u()},get children(){var r=Oe(),i=r.firstChild;return(0,e.insert)(r,()=>v(s().phase),i),(0,e.insert)(r,()=>z(s().startedAt,null,t.store.now()),null),(0,e.insert)(r,(0,e.createComponent)(n.Show,{get when(){return s().estimatedCostUsd!==void 0},get children(){return[` `,`· estimated USD `,(0,e.memo)(()=>(s().estimatedCostUsd??0).toFixed(2))]}}),null),r}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return s().question?.id},keyed:!0,children:n=>(0,e.createComponent)(Ge,{get questions(){return s().question?.questions??[]},get destination(){return U(s().plan.settings)},get busy(){return r()},onAnswer:e=>f(()=>t.port.answer({operationId:s().operationId,questionId:n,answer:e}))})}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return u()},get children(){var n=ke(),i=n.firstChild;return i.$$click=()=>void f(()=>t.port.cancel({operationId:s().operationId})),(0,e.effect)(()=>i.disabled=r()),n}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return s().result},children:i=>{let a=i();return a.kind===`fix`?(()=>{var i=Fe(),o=i.firstChild;return(0,e.insert)(o,()=>le(a.status),null),(0,e.insert)(o,(()=>{var t=(0,e.memo)(()=>a.resolution===`applied`||a.resolution===`discarded`);return()=>t()?` · ${a.resolution}`:``})(),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return a.report},get children(){var t=Y();return(0,e.insert)(t,()=>a.report),t}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return a.diff},get fallback(){return Ie()},get children(){var t=Me();return(0,e.insert)(t,()=>a.diff),t}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return a.truncated},get children(){return Ne()}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return a.resolution===`pending`},get children(){var n=Pe(),i=n.firstChild,a=i.nextSibling;return i.$$click=()=>void f(()=>t.port.resolve({operationId:s().operationId,action:`apply`})),a.$$click=()=>void f(()=>t.port.resolve({operationId:s().operationId,action:`discard`})),(0,e.effect)(e=>{var t=r(),n=r();return t!==e.e&&(i.disabled=e.e=t),n!==e.t&&(a.disabled=e.t=n),e},{e:void 0,t:void 0}),n}}),null),(0,e.effect)(()=>(0,e.setAttribute)(o,`data-disposition`,a.status)),i})():(()=>{var t=Re();return(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return a.kind===`policy`?a:void 0},get fallback(){return(()=>{var t=ze(),n=t.firstChild;return(0,e.insert)(t,()=>ve(X(a)),n),(0,e.effect)(()=>(0,e.setAttribute)(t,`data-disposition`,X(a))),t})()},children:t=>(()=>{var n=Be(),r=n.firstChild.nextSibling;return r.nextSibling,(0,e.insert)(n,()=>t().targetPath,r),n})()}),null),(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>a.kind===`policy`)()?a.content:void 0},get fallback(){return(()=>{var t=Y();return(0,e.insert)(t,(()=>{var t=(0,e.memo)(()=>a.kind===`validation`);return()=>t()?a.report:``})()),t})()},children:t=>(()=>{var n=Ve();return(0,e.insert)(n,t),n})()}),null),(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>a.kind===`policy`)()?a.reviewNotes:void 0},children:t=>(0,e.createComponent)(n.For,{get each(){return t()},children:t=>(()=>{var n=He();return(0,e.insert)(n,t),n})()})}),null),(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return a.truncated},get children(){return Le()}}),null),t})()}}),null),(0,e.effect)(n=>{var r=!!t.compact,a=s().status;return r!==n.e&&i.classList.toggle(`gs-operation-compact`,n.e=r),a!==n.t&&(0,e.setAttribute)(m,`data-status`,n.t=a),n},{e:void 0,t:void 0}),i})()}function Ge(t){let[r,i]=(0,n.createSignal)(``);return(()=>{var a=Ue(),o=a.firstChild.nextSibling,s=o.nextSibling,c=s.firstChild.nextSibling,l=c.nextSibling,u=l.firstChild.nextSibling;u.nextSibling;var d=s.nextSibling.firstChild;return a.addEventListener(`submit`,e=>{e.preventDefault(),t.onAnswer(r())}),(0,e.insert)(o,(0,e.createComponent)(n.For,{get each(){return t.questions},children:t=>(()=>{var n=We();return(0,e.insert)(n,t),n})()})),c.$$input=e=>i(e.currentTarget.value),(0,e.insert)(l,()=>t.destination,u),(0,e.effect)(e=>{var n=t.busy,i=t.busy||!r().trim();return n!==e.e&&(c.disabled=e.e=n),i!==e.t&&(d.disabled=e.t=i),e},{e:void 0,t:void 0}),(0,e.effect)(()=>c.value=r()),a})()}(0,e.delegateEvents)([`click`,`input`]);var Ke=(0,e.template)(`<button class=gs-button>New policy draft`),qe=(0,e.template)(`<p class=gs-muted>To validate a finding, open it in a completed scan.`),Je=(0,e.template)(`<ul class=gs-list aria-label="Recent operations">`),Ye=(0,e.template)(`<section class=gs-operations aria-label="Policy and validation"><div class=gs-section-heading><h3>Policy and validation`),Xe=(0,e.template)(`<li><button class=gs-list-item><span class=gs-list-top><span class=gs-list-title></span><span class=gs-status></span></span><span class=gs-list-meta> · `),Ze=(0,e.template)(`<h3 class=gs-wrap>`),Qe=(0,e.template)(`<article class=gs-detail aria-label="Selected operation">`),$e=(0,e.template)(`<p class=gs-alert role=alert>`),et=(0,e.template)(`<button class=gs-button type=button>Back`),tt=(0,e.template)(`<form class="gs-form gs-composer"><p class=gs-muted>Drafts a security policy from the repository and asks you about anything it can't infer.</p><fieldset><label>Repository<input aria-label="Operation repository"required></label><label>Directory <span class=gs-muted>optional</span><input aria-label="Policy component directory"placeholder=src/api><span class=gs-help>Limit the draft to one part of the repository.</span></label><details class=gs-disclosure><summary>Context files</summary><label>Context files<textarea aria-label="Operation context files"placeholder=docs/architecture.md></textarea><span class=gs-help>One path per line.</span></label></details><div class=gs-actions><button class="gs-button gs-primary"type=submit>`),Q=e=>e.kind===`policy`?`Policy · ${m(e.repository)}${e.plan.path&&e.plan.path!==`.`?` / ${e.plan.path}`:``}`:e.plan.finding?.split(`
`)[0]??`Finding`;function nt(t){let r=()=>t.store.operations(),[i,a]=(0,n.createSignal)(),[o,s]=(0,n.createSignal)(!1),c=(0,n.createMemo)(()=>r().find(e=>e.operationId===i())??r().find(e=>e.status===`awaiting_answers`)??r()[0]),l=()=>t.policy&&(o()||r().length===0);return(()=>{var i=Ye(),o=i.firstChild;return o.firstChild,(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>!!t.policy)()&&!l()},get children(){var e=Ke();return e.$$click=()=>s(!0),e}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return l()},get children(){return(0,e.createComponent)(rt,{get directory(){return t.directory},get port(){return t.port},get store(){return t.store},get onClose(){return r().length?()=>s(!1):void 0},onPrepared:e=>{a(e),s(!1)}})}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return!r().length},get children(){return qe()}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return r().length>1},get children(){var t=Je();return(0,e.insert)(t,(0,e.createComponent)(n.For,{get each(){return r()},children:t=>(()=>{var n=Xe(),r=n.firstChild,i=r.firstChild,o=i.firstChild,s=o.nextSibling,l=i.nextSibling,u=l.firstChild;return r.$$click=()=>a(t.operationId),(0,e.insert)(o,()=>Q(t)),(0,e.insert)(s,()=>J(t.status)),(0,e.insert)(l,()=>({policy:`Policy draft`,validation:`Validation`,fix:`Fix`})[t.kind],u),(0,e.insert)(l,()=>K(t.createdAt),null),(0,e.effect)(n=>{var i=c()?.operationId===t.operationId,a=t.status;return i!==n.e&&(0,e.setAttribute)(r,`aria-pressed`,n.e=i),a!==n.t&&(0,e.setAttribute)(s,`data-status`,n.t=a),n},{e:void 0,t:void 0}),n})()})),t}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>!l())()&&c()?.operationId},keyed:!0,children:r=>(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>c()?.operationId===r)()?c():void 0},children:r=>(()=>{var i=Qe();return(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return r().kind!==`policy`},get children(){var t=Ze();return(0,e.insert)(t,()=>Q(r())),t}}),null),(0,e.insert)(i,(0,e.createComponent)(Z,{get op(){return r()},get port(){return t.port},get store(){return t.store}}),null),i})()})}),null),i})()}function rt(t){let[r,i]=(0,n.createSignal)(t.directory),[a,o]=(0,n.createSignal)(``),[s,c]=(0,n.createSignal)(``),[l,u]=(0,n.createSignal)(!1),[d,f]=(0,n.createSignal)(``),p=async e=>{if(e.preventDefault(),!l()){u(!0),f(``);try{let e=await t.port.prepare({kind:`policy`,repository:r().trim()||t.directory,contextFiles:B(s()),...a().trim()?{path:a().trim()}:{}});await t.store.refreshOperations(),t.onPrepared(e.operationId)}catch(e){f(V(e))}finally{u(!1)}}};return(()=>{var u=tt(),f=u.firstChild.nextSibling,m=f.firstChild,h=m.firstChild.nextSibling,g=m.nextSibling,_=g.firstChild.nextSibling.nextSibling,v=g.nextSibling,y=v.firstChild.nextSibling.firstChild.nextSibling,b=v.nextSibling,x=b.firstChild;return u.addEventListener(`submit`,e=>void p(e)),(0,e.insert)(u,(0,e.createComponent)(n.Show,{get when(){return d()},get children(){var t=$e();return(0,e.insert)(t,d),t}}),f),h.$$input=e=>{i(e.currentTarget.value),o(``),c(``)},(0,e.setAttribute)(h,`spellcheck`,!1),_.$$input=e=>o(e.currentTarget.value),(0,e.setAttribute)(_,`spellcheck`,!1),y.$$input=e=>c(e.currentTarget.value),(0,e.insert)(x,()=>l()?`Preparing…`:`Review policy draft`),(0,e.insert)(b,(0,e.createComponent)(n.Show,{get when(){return t.onClose},get children(){var e=et();return e.$$click=()=>t.onClose?.(),e}}),null),(0,e.effect)(()=>f.disabled=l()),(0,e.effect)(()=>h.value=r()),(0,e.effect)(()=>_.value=a()),(0,e.effect)(()=>y.value=s()),u})()}(0,e.delegateEvents)([`click`,`input`]);var it=(0,e.template)(`<dd class=gs-muted> records match finding IDs · <!> not confirmed in this scan`),at=(0,e.template)(`<p class=gs-muted>Informational and unclassified items are not listed here. They are in the full local SDK result.`),ot=(0,e.template)(`<section class=gs-outcome aria-label="Scan outcome"><p class=gs-muted></p><details class="gs-section gs-coverage"><summary>Coverage</summary><p></p><dl class=gs-facts><dt>Repository matching</dt><dd>`),st=(0,e.template)(`<dt>`),ct=(0,e.template)(`<dd>`),lt=(0,e.template)(`<p class=gs-muted>`);function ut(t){let r=()=>t.run.assessment?.repositoryFindings;return(()=>{var i=ot(),a=i.firstChild,o=a.nextSibling,s=o.firstChild.nextSibling,c=s.nextSibling,l=c.firstChild,u=l.nextSibling;return(0,e.insert)(a,()=>re(t.run)),(0,e.insert)(s,()=>ie(t.run)),(0,e.insert)(c,(0,e.createComponent)(n.For,{get each(){return oe(t.run)},children:t=>[(0,e.createComponent)(n.Show,{get when(){return t.label},get children(){var n=st();return(0,e.insert)(n,()=>t.label),n}}),(()=>{var n=ct();return(0,e.insert)(n,()=>t.value),n})()]}),l),(0,e.insert)(u,()=>ae(t.run)),(0,e.insert)(c,(0,e.createComponent)(n.Show,{get when(){return r()?.available},get children(){var t=it(),n=t.firstChild,i=n.nextSibling;return i.nextSibling,(0,e.insert)(t,()=>r()?.withMatchedFindingIds??`Unknown`,n),(0,e.insert)(t,()=>r()?.notConfirmedInLatestScan??`Unknown`,i),t}}),null),(0,e.insert)(o,(0,e.createComponent)(n.For,{get each(){return t.run.assessment?.notes??[]},children:t=>(()=>{var n=lt();return(0,e.insert)(n,t),n})()}),null),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return t.run.skipped||t.run.assessment?.returnedFindings.informational},get children(){return at()}}),null),i})()}var dt=(0,e.template)(`<section class=gs-findings aria-label="Scan findings"><div class=gs-section-heading><h3>Findings</h3><span class=gs-muted> to review`),ft=(0,e.template)(`<pre>`),pt=(0,e.template)(`<details class=gs-finding><summary><span class=gs-severity></span><span></span></summary><div class=gs-finding-body><p class="gs-mono gs-muted">:<!> · <!> · <!> confidence</p><p></p><h4>Suggested fix</h4><p>`),mt=(0,e.template)(`<p class=gs-alert role=alert>`),ht=(0,e.template)(`<span class=gs-muted>`),gt=(0,e.template)(`<div class=gs-actions><button class=gs-button>`),_t=(0,e.template)(`<div class=gs-finding-validation>`);function vt(t){return(()=>{var r=dt(),i=r.firstChild.firstChild.nextSibling,a=i.firstChild;return(0,e.insert)(i,()=>t.run.findings.length,a),(0,e.insert)(r,(0,e.createComponent)(n.For,{get each(){return t.run.findings},children:r=>(()=>{var i=pt(),a=i.firstChild,o=a.firstChild,s=o.nextSibling,c=a.nextSibling,l=c.firstChild,u=l.firstChild,d=u.nextSibling,f=d.nextSibling.nextSibling,p=f.nextSibling.nextSibling;p.nextSibling;var m=l.nextSibling,h=m.nextSibling,g=h.nextSibling;return(0,e.insert)(o,()=>r.severity),(0,e.insert)(s,()=>r.title),(0,e.insert)(l,()=>r.path,u),(0,e.insert)(l,()=>r.line,d),(0,e.insert)(l,()=>r.cwe,f),(0,e.insert)(l,()=>r.confidence,p),(0,e.insert)(m,()=>r.summary),(0,e.insert)(c,(0,e.createComponent)(n.Show,{get when(){return r.evidence},get children(){var t=ft();return(0,e.insert)(t,()=>r.evidence),t}}),h),(0,e.insert)(g,()=>r.remediation),(0,e.insert)(c,(0,e.createComponent)(n.Show,{get when(){return t.validation},children:i=>[(0,e.createComponent)(yt,{kind:`validation`,get run(){return t.run},finding:r,get port(){return i()},get store(){return t.store}}),(0,e.createComponent)(n.Show,{get when(){return i().capabilities?.fix??!0},get children(){return(0,e.createComponent)(yt,{kind:`fix`,get run(){return t.run},finding:r,get port(){return i()},get store(){return t.store}})}})]}),null),(0,e.effect)(()=>(0,e.setAttribute)(o,`data-severity`,r.severity)),i})()}),null),r})()}function yt(t){let r=()=>se(t.finding),i=(0,n.createMemo)(()=>t.store.operations().filter(e=>e.kind===t.kind&&e.plan.finding===r()).reduce((e,t)=>!e||t.createdAt>e.createdAt?t:e,void 0)),[a,o]=(0,n.createSignal)(!1),[s,c]=(0,n.createSignal)(``),l=async()=>{if(!a()){o(!0),c(``);try{await t.port.prepare({kind:t.kind,repository:t.run.repository,finding:r()}),await t.store.refreshOperations()}catch(e){c(V(e))}finally{o(!1)}}},u=()=>{let e=i()?.status;return!e||e===`completed`||e===`cancelled`||e===`error`};return(()=>{var r=_t();return(0,e.insert)(r,(0,e.createComponent)(n.Show,{get when(){return i()?.operationId},keyed:!0,children:r=>(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>i()?.operationId===r)()?i():void 0},children:n=>(0,e.createComponent)(Z,{get op(){return n()},get port(){return t.port},get store(){return t.store},compact:!0})})}),null),(0,e.insert)(r,(0,e.createComponent)(n.Show,{get when(){return s()},get children(){var t=mt();return(0,e.insert)(t,s),t}}),null),(0,e.insert)(r,(0,e.createComponent)(n.Show,{get when(){return u()},get children(){var r=gt(),o=r.firstChild;return o.$$click=()=>void l(),(0,e.insert)(o,(()=>{var n=(0,e.memo)(()=>!!a());return()=>n()?`Preparing…`:(0,e.memo)(()=>t.kind===`fix`)()?i()?`Propose another fix`:`Propose fix`:i()?`Validate again`:`Validate finding`})()),(0,e.insert)(r,(0,e.createComponent)(n.Show,{get when(){return!i()},get children(){var n=ht();return(0,e.insert)(n,()=>t.kind===`fix`?`Writes a fix in a copy of the last commit. You review the diff first.`:`Checks the finding against the source. You approve first.`),n}}),null),(0,e.effect)(()=>o.disabled=a()),r}}),null),r})()}(0,e.delegateEvents)([`click`]);var bt=(0,e.template)(`<p class=gs-muted>`),xt=(0,e.template)(`<ul class=gs-workers>`),St=(0,e.template)(`<details class=gs-disclosure><summary>History</summary><ol class=gs-timeline>`),Ct=(0,e.template)(`<details class="gs-section gs-activity"aria-label="Scan activity"><summary>Activity`),wt=(0,e.template)(`<li><span class=gs-worker-name></span><span class=gs-worker-label></span><span class=gs-status>`),Tt=(0,e.template)(`<span class="gs-mono gs-muted gs-block">`),Et=(0,e.template)(`<li><time></time><span> · <!> · `),Dt=(0,e.template)(`<li><time></time><span>`),Ot=(0,e.template)(`<dt>Signed in with`),$=(0,e.template)(`<dd>`),kt=(0,e.template)(`<dt>Notices`),At=(0,e.template)(`<dt>Range`),jt=(0,e.template)(`<dt>Pricing`),Mt=(0,e.template)(`<dt>Deep review`),Nt=(0,e.template)(`<dt>Connection`),Pt=(0,e.template)(`<dt>Model`),Ft=(0,e.template)(`<dt>Focus`),It=(0,e.template)(`<dt>Context files`),Lt=(0,e.template)(`<dt>SDK scan ID`),Rt=(0,e.template)(`<dd class=gs-mono>`),zt=(0,e.template)(`<p class=gs-muted>Restored from local history.`),Bt=(0,e.template)(`<details class="gs-section gs-info"><summary>Usage and details</summary><dl class=gs-facts><dt>Estimated usage</dt><dd></dd><dd class=gs-muted></dd><dt>Repository</dt><dd class=gs-wrap></dd><dt>Scope</dt><dd></dd><dt>Run ID</dt><dd class=gs-mono>`),Vt=(0,e.template)(`<dt>Tokens`),Ht=(0,e.template)(`<dd> input · <!> cached · <!> output`);function Ut(t){let r=()=>t.run;return(()=>{var t=Ct();return t.firstChild,(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return P(r())||F(r())},get children(){var t=bt();return(0,e.insert)(t,()=>[P(r()),F(r())].filter(Boolean).join(` · `)),t}}),null),(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return M(r()).length},get fallback(){return(()=>{var t=bt();return(0,e.insert)(t,()=>r().status===`running`?`Waiting for activity.`:`No activity recorded.`),t})()},get children(){var t=xt();return(0,e.insert)(t,(0,e.createComponent)(n.For,{get each(){return te(r()).slice(0,4)},children:t=>(()=>{var n=wt(),i=n.firstChild,a=i.nextSibling,o=a.nextSibling;return(0,e.insert)(i,()=>ne(t.worker)),(0,e.insert)(a,()=>t.label),(0,e.insert)(o,()=>N(t.status,r())),(0,e.effect)(r=>{var i=t.id,a=t.status;return i!==r.e&&(0,e.setAttribute)(n,`data-activity-id`,r.e=i),a!==r.t&&(0,e.setAttribute)(o,`data-status`,r.t=a),r},{e:void 0,t:void 0}),n})()})),t}}),null),(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return M(r()).length||r().events.length},get children(){var t=St(),i=t.firstChild.nextSibling;return(0,e.insert)(i,(0,e.createComponent)(n.For,{get each(){return M(r())},children:t=>(()=>{var i=Et(),a=i.firstChild,o=a.nextSibling,s=o.firstChild,c=s.nextSibling;return c.nextSibling,(0,e.insert)(a,()=>q(t.updatedAt)),(0,e.insert)(o,()=>ne(t.worker),s),(0,e.insert)(o,()=>t.label,c),(0,e.insert)(o,()=>N(t.status,r()),null),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return t.paths.length},get children(){var n=Tt();return(0,e.insert)(n,()=>t.paths.join(`, `)),n}}),null),(0,e.effect)(()=>(0,e.setAttribute)(a,`datetime`,t.updatedAt)),i})()}),null),(0,e.insert)(i,(0,e.createComponent)(n.For,{get each(){return[...r().events].reverse().slice(0,20)},children:t=>(()=>{var n=Dt(),r=n.firstChild,i=r.nextSibling;return(0,e.insert)(r,()=>q(t.time)),(0,e.insert)(i,()=>t.message),(0,e.effect)(()=>(0,e.setAttribute)(r,`datetime`,t.time)),n})()}),null),t}}),null),t})()}function Wt(t){let r=()=>t.run,i=()=>r().telemetry?.measurement?.usage,a=()=>r().telemetry?.measurement?.cost;return(()=>{var t=Bt(),o=t.firstChild.nextSibling,s=o.firstChild.nextSibling,c=s.nextSibling,l=c.nextSibling,u=l.nextSibling,d=u.nextSibling.nextSibling,f=d.nextSibling,p=f.nextSibling;return(0,e.insert)(s,()=>A(r())),(0,e.insert)(c,()=>ee(r())),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return r().telemetry?.authentication},get children(){return[Ot(),(()=>{var t=$();return(0,e.insert)(t,()=>r().telemetry?.authentication),t})()]}}),l),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return L(r())||R(r())},get children(){return[kt(),(()=>{var t=$();return(0,e.insert)(t,()=>[L(r()),R(r())].filter(Boolean).join(` · `)),t})()]}}),l),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return j(r())},get children(){return[At(),(()=>{var t=$();return(0,e.insert)(t,()=>j(r())),t})()]}}),l),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return a()?.model||a()?.pricingAsOf},get children(){return[jt(),(()=>{var t=$();return(0,e.insert)(t,()=>[a()?.model,a()?.pricingAsOf].filter(Boolean).join(` · `)),t})()]}}),l),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return i()},children:t=>[Vt(),(()=>{var n=Ht(),r=n.firstChild,i=r.nextSibling,a=i.nextSibling.nextSibling;return a.nextSibling,(0,e.insert)(n,()=>t().inputTokens.toLocaleString(),r),(0,e.insert)(n,()=>t().cachedInputTokens.toLocaleString(),i),(0,e.insert)(n,()=>t().outputTokens.toLocaleString(),a),n})()]}),l),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return r().deepProgress},get children(){return[Mt(),(()=>{var t=$();return(0,e.insert)(t,()=>D(r())),t})()]}}),l),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return I(r())},get children(){return[Nt(),(()=>{var t=$();return(0,e.insert)(t,()=>I(r())),t})()]}}),l),(0,e.insert)(u,()=>r().repository),(0,e.insert)(d,()=>_(r())),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return r().model??r().plan?.settings.codex.model},get children(){return[Pt(),(()=>{var t=$();return(0,e.insert)(t,()=>r().model??r().plan?.settings.codex.model),t})()]}}),f),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return r().plan?.scanPrompt},get children(){return[Ft(),(()=>{var t=$();return(0,e.insert)(t,()=>r().plan?.scanPrompt),t})()]}}),f),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return r().plan?.contextFiles.length},get children(){return[It(),(()=>{var t=$();return(0,e.insert)(t,()=>r().plan?.contextFiles.map(e=>e.path).join(`, `)),t})()]}}),f),(0,e.insert)(p,()=>r().runId),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return r().scanId},get children(){return[Lt(),(()=>{var t=Rt();return(0,e.insert)(t,()=>r().scanId),t})()]}}),null),(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return r().archived},get children(){return zt()}}),null),t})()}var Gt=(0,e.template)(`<progress class=gs-progress>`),Kt=(0,e.template)(`<div class="gs-progress-meta gs-muted"><span></span><span>`),qt=(0,e.template)(`<button class=gs-link>`),Jt=(0,e.template)(`<p class=gs-alert role=alert>`),Yt=(0,e.template)(`<p class=gs-lede>`),Xt=(0,e.template)(`<p class=gs-note>Cancelled before it finished, so results are incomplete.`),Zt=(0,e.template)(`<div class=gs-empty><h3>No findings reported</h3><p>Check coverage to see what was reviewed.`),Qt=(0,e.template)(`<article class=gs-detail aria-label="Selected scan"><header class=gs-detail-title><h3></h3><p class="gs-muted gs-wrap"></p><p class=gs-muted> · </p></header><div class=gs-progress-heading role=status aria-live=polite><h3></h3><span class="gs-muted gs-tabular"></span></div><div class=gs-scan-actions><span class="gs-muted gs-tabular">`);function $t(t){let r=()=>t.run,[i,a]=(0,n.createSignal)(!1),[o,s]=(0,n.createSignal)(``),c=async()=>{let e=r().runId;if(!i()&&e){a(!0),s(``);try{await t.port.cancel({runId:e}),await t.store.refreshScans()}catch(e){s(V(e))}finally{a(!1)}}};return(()=>{var a=Qt(),s=a.firstChild,l=s.firstChild,u=l.nextSibling,d=u.nextSibling,f=d.firstChild,p=s.nextSibling,m=p.firstChild,g=m.nextSibling,v=p.nextSibling,b=v.firstChild;return(0,e.insert)(l,()=>h(r())),(0,e.insert)(u,()=>r().repository),(0,e.insert)(d,()=>r().mode??r().plan?.settings.scan.mode??`standard`,f),(0,e.insert)(d,()=>_(r()),null),(0,e.insert)(m,()=>S(r())),(0,e.insert)(g,()=>z(r().startedAt,r().finishedAt,t.store.now())),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return w(r())},get children(){var t=Gt();return(0,e.effect)(n=>{var i=`${S(r())} progress`,a=y(r()).total;return i!==n.e&&(0,e.setAttribute)(t,`aria-label`,n.e=i),a!==n.t&&(0,e.setAttribute)(t,`max`,n.t=a),n},{e:void 0,t:void 0}),(0,e.effect)(()=>t.value=y(r()).done),t}}),v),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return C(r())},get children(){var t=Kt(),n=t.firstChild,i=n.nextSibling;return(0,e.insert)(n,()=>T(r())),(0,e.insert)(i,()=>E(r())),t}}),v),(0,e.insert)(b,()=>A(r())),(0,e.insert)(v,(0,e.createComponent)(n.Show,{get when(){return r().status===`running`},get children(){var t=qt();return t.$$click=()=>void c(),(0,e.insert)(t,()=>i()?`Stopping…`:`Cancel scan`),(0,e.effect)(()=>t.disabled=i()),t}}),null),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return o()||r().error},get children(){var t=Jt();return(0,e.insert)(t,()=>o()||r().error),t}}),null),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return r().status===`running`},get children(){var t=Yt();return(0,e.insert)(t,()=>O(r())),t}}),null),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return r().status===`cancelled`},get children(){return Xt()}}),null),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>r().status===`completed`)()&&r().findings.length===0},get children(){return Zt()}}),null),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return r().findings.length},get children(){return(0,e.createComponent)(vt,{get run(){return r()},get store(){return t.store},get validation(){return t.validation}})}}),null),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return r().status===`completed`},get children(){return(0,e.createComponent)(ut,{get run(){return r()}})}}),null),(0,e.insert)(a,(0,e.createComponent)(Ut,{get run(){return r()}}),null),(0,e.insert)(a,(0,e.createComponent)(Wt,{get run(){return r()}}),null),(0,e.effect)(()=>(0,e.setAttribute)(m,`data-status`,r().status)),a})()}(0,e.delegateEvents)([`click`]);var en=(0,e.template)(`<details class=gs-runs aria-label="Scan history"><summary><span>Switch scan</span><span class=gs-muted> recent</span></summary><ul class=gs-list>`),tn=(0,e.template)(`<li><button class=gs-list-item><span class=gs-list-top><span class=gs-list-title></span><span class=gs-status></span></span><span class=gs-list-meta></span><span class=gs-list-meta> · <!> · `);function nn(t){let r;return(()=>{var i=en(),a=i.firstChild,o=a.firstChild.nextSibling,s=o.firstChild,c=a.nextSibling;return(0,e.use)(e=>r=e,i),(0,e.insert)(o,()=>t.runs.length,s),(0,e.insert)(c,(0,e.createComponent)(n.For,{get each(){return t.runs},children:n=>(()=>{var i=tn(),a=i.firstChild,o=a.firstChild,s=o.firstChild,c=s.nextSibling,l=o.nextSibling,u=l.nextSibling,d=u.firstChild,f=d.nextSibling;return f.nextSibling,a.$$click=()=>{t.onSelect(n.runId),r&&(r.open=!1)},(0,e.insert)(s,()=>h(n)),(0,e.insert)(c,()=>J(n.status)),(0,e.insert)(l,()=>n.repository),(0,e.insert)(u,()=>n.mode??n.plan?.settings.scan.mode??`standard`,d),(0,e.insert)(u,()=>_(n),f),(0,e.insert)(u,()=>K(n.startedAt),null),(0,e.insert)(u,(()=>{var t=(0,e.memo)(()=>n.status===`completed`);return()=>t()?` · ${n.findings.length} ${n.findings.length===1?`finding`:`findings`}`:``})(),null),(0,e.effect)(r=>{var i=t.selectedId===n.runId,o=n.status;return i!==r.e&&(0,e.setAttribute)(a,`aria-pressed`,r.e=i),o!==r.t&&(0,e.setAttribute)(c,`data-status`,r.t=o),r},{e:void 0,t:void 0}),i})()})),i})()}(0,e.delegateEvents)([`click`]);var rn=(0,e.template)(`<dt>Focus`),an=(0,e.template)(`<dd>`),on=(0,e.template)(`<dt>Context files`),sn=(0,e.template)(`<p>Approving sends source from this repository and the listed files to <!>. Results are saved on this machine.`),cn=(0,e.template)(`<p>`),ln=(0,e.template)(`<p class=gs-note role=status> scans are running. Start this one when a scan finishes.`),un=(0,e.template)(`<p class="gs-note gs-danger">This preview has expired. Edit the scan to prepare it again.`),dn=(0,e.template)(`<div class=gs-review><h3>Review scan</h3><dl class=gs-facts><dt>Repository</dt><dd></dd><dt>Scope</dt><dd></dd><dt>Depth</dt><dd></dd><dt>Model</dt><dd> · <!> reasoning</dd></dl><div class=gs-approval><details class=gs-disclosure><summary>Route and configuration</summary><p></p><p class=gs-mono></p></details></div><div class=gs-actions><button class="gs-button gs-primary"></button><button class=gs-button>Edit scan`),fn=(0,e.template)(`<p>Mock scan: synthetic results, no model calls.`);function pn(t){let r=()=>Date.parse(t.plan.expiresAt)<=t.store.now(),i=()=>t.store.running()>=t.store.catalog.maxConcurrent;return(()=>{var a=dn(),o=a.firstChild.nextSibling,s=o.firstChild.nextSibling,c=s.nextSibling.nextSibling,l=c.nextSibling.nextSibling,u=l.nextSibling,d=u.nextSibling,f=d.firstChild,p=f.nextSibling;p.nextSibling;var m=o.nextSibling,h=m.firstChild,_=h.firstChild.nextSibling,v=_.nextSibling,y=m.nextSibling,b=y.firstChild,x=b.nextSibling;return(0,e.insert)(s,()=>t.plan.repository),(0,e.insert)(c,()=>g(t.plan)),(0,e.insert)(l,()=>t.plan.settings.scan.mode===`deep`?`Deep`:`Standard`),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return t.plan.scanPrompt},get children(){return[rn(),(()=>{var n=an();return(0,e.insert)(n,()=>t.plan.scanPrompt),n})()]}}),u),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return t.plan.contextFiles.length},get children(){return[on(),(()=>{var n=an();return(0,e.insert)(n,()=>t.plan.contextFiles.map(e=>e.path).join(`, `)),n})()]}}),u),(0,e.insert)(d,()=>t.plan.settings.codex.model,f),(0,e.insert)(d,()=>t.plan.settings.codex.reasoningEffort,p),(0,e.insert)(d,()=>t.plan.settings.codex.daybreak?` · Daybreak`:``,null),(0,e.insert)(m,(0,e.createComponent)(n.Show,{get when(){return!t.plan.mock},get fallback(){return fn()},get children(){return[(()=>{var n=sn(),r=n.firstChild.nextSibling;return r.nextSibling,(0,e.insert)(n,()=>U(t.plan.settings),r),n})(),(()=>{var n=cn();return(0,e.insert)(n,()=>de(t.plan.settings.scan.maxCostUsd)),n})()]}}),h),(0,e.insert)(_,()=>H(t.plan.settings)),(0,e.insert)(v,()=>t.plan.globalConfigFile),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return i()},get children(){var n=ln(),r=n.firstChild;return(0,e.insert)(n,()=>t.store.catalog.maxConcurrent,r),n}}),y),(0,e.insert)(a,(0,e.createComponent)(n.Show,{get when(){return r()},get children(){return un()}}),y),b.$$click=()=>t.onStart(),(0,e.insert)(b,(()=>{var n=(0,e.memo)(()=>!!t.busy);return()=>n()?`Starting…`:t.plan.mock?`Start mock scan`:`Approve and start`})()),x.$$click=()=>t.onEdit(),(0,e.effect)(e=>{var n=t.busy||i()||r(),a=t.busy;return n!==e.e&&(b.disabled=e.e=n),a!==e.t&&(x.disabled=e.t=a),e},{e:void 0,t:void 0}),a})()}(0,e.delegateEvents)([`click`]);var mn=(0,e.template)(`<button class=gs-link>Close`),hn=(0,e.template)(`<p class=gs-intro>Scan a repository for security issues. You review what will be sent before it starts.`),gn=(0,e.template)(`<p class=gs-alert role=alert>`),_n=(0,e.template)(`<section class=gs-composer aria-label="New scan"><div class=gs-section-heading><h3>New scan`),vn=(0,e.template)(`<form class=gs-form><fieldset><label>Repository<input required aria-label=Repository><span class=gs-help>Changing the repository clears paths and files.</span></label><label>Depth<select aria-label="Scan depth"><option value=default>Default from settings</option><option value=standard>Standard</option><option value=deep>Deep</option></select><span class=gs-help>Deep takes longer and costs more.</span></label><label>Focus <span class=gs-muted>optional</span><textarea maxlength=8000 placeholder="For example: authorization and tenant isolation"aria-label="Scan focus"></textarea></label><details class=gs-disclosure><summary>Paths and context files</summary><label>Paths to review<textarea placeholder="src/auth
src/api"aria-label="Scope paths"></textarea><span class=gs-help>One path per line. Leave blank for everything.</span></label><label>Only changes<input placeholder="uncommitted, or a base ref such as origin/main"aria-label=Changes><span class=gs-help>Scans a diff instead of paths. Standard depth only.</span></label><label>Context files<textarea placeholder="docs/architecture.md
SECURITY.md"aria-label="Context files"></textarea><span class=gs-help>Documents that explain the system, one per line.</span></label></details><div class=gs-actions><button type=submit class="gs-button gs-primary">`);function yn(t){let r=t.plan,[i,a]=(0,n.createSignal)(r?.repository??t.directory),[o,s]=(0,n.createSignal)(r?.inputs.mode??`default`),[c,l]=(0,n.createSignal)(r?.scanPrompt??``),[u,d]=(0,n.createSignal)(r?.scopePaths.join(`
`)??``),[f,p]=(0,n.createSignal)(r?.changes??``),[m,h]=(0,n.createSignal)(r?.contextFiles.map(e=>e.path).join(`
`)??``),[g,_]=(0,n.createSignal)(r),[v,y]=(0,n.createSignal)(!1),[b,x]=(0,n.createSignal)(``),S=async e=>{if(!v()){y(!0),x(``);try{await e()}catch(e){x(V(e))}finally{y(!1)}}},C=e=>{e.preventDefault(),S(async()=>{let e={repository:i().trim()||t.directory,scanPrompt:c(),...f().trim()?{changes:f().trim()}:{scopePaths:B(u())},contextFiles:B(m()),...o()==="default"?{}:{mode:o()}},n=W(await t.port.prepare(e));if(!n.plan)throw Error(`The server did not return a scan preview.`);_(n.plan),t.store.refreshScans()})},w=e=>void S(async()=>{let n=W(await t.port.start({planId:e.id}));await t.store.refreshScans(),t.onStarted(n.runId)});return(()=>{var r=_n(),y=r.firstChild;return y.firstChild,(0,e.insert)(y,(0,e.createComponent)(n.Show,{get when(){return t.onClose},get children(){var n=mn();return n.$$click=()=>t.onClose?.(),(0,e.effect)(()=>n.disabled=v()),n}}),null),(0,e.insert)(r,(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>!t.onClose)()&&!g()},get children(){return hn()}}),null),(0,e.insert)(r,(0,e.createComponent)(n.Show,{get when(){return b()},get children(){var t=gn();return(0,e.insert)(t,b),t}}),null),(0,e.insert)(r,(0,e.createComponent)(n.Show,{get when(){return g()},get fallback(){return(()=>{var n=vn(),r=n.firstChild,g=r.firstChild,_=g.firstChild.nextSibling,y=g.nextSibling,b=y.firstChild.nextSibling,x=y.nextSibling,S=x.firstChild.nextSibling.nextSibling,w=x.nextSibling,T=w.firstChild.nextSibling,E=T.firstChild.nextSibling,D=T.nextSibling,O=D.firstChild.nextSibling,k=D.nextSibling.firstChild.nextSibling,A=w.nextSibling.firstChild;return n.addEventListener(`submit`,C),_.$$input=e=>{a(e.currentTarget.value),d(``),h(``)},(0,e.setAttribute)(_,`spellcheck`,!1),b.addEventListener(`change`,e=>s(e.currentTarget.value)),S.$$input=e=>l(e.currentTarget.value),E.$$input=e=>d(e.currentTarget.value),O.$$input=e=>p(e.currentTarget.value),(0,e.setAttribute)(O,`spellcheck`,!1),k.$$input=e=>h(e.currentTarget.value),(0,e.insert)(A,()=>v()?`Preparing…`:`Review scan`),(0,e.effect)(e=>{var n=v(),i=!t.store.loaded();return n!==e.e&&(r.disabled=e.e=n),i!==e.t&&(A.disabled=e.t=i),e},{e:void 0,t:void 0}),(0,e.effect)(()=>_.value=i()),(0,e.effect)(()=>b.value=o()),(0,e.effect)(()=>S.value=c()),(0,e.effect)(()=>E.value=u()),(0,e.effect)(()=>O.value=f()),(0,e.effect)(()=>k.value=m()),n})()},children:n=>(0,e.createComponent)(pn,{get plan(){return n()},get store(){return t.store},get busy(){return v()},onStart:()=>w(n()),onEdit:()=>_(void 0)})}),null),r})()}(0,e.delegateEvents)([`click`,`input`]);var bn=(0,e.template)(`<p class=gs-alert role=alert> <button class=gs-link>Retry`),xn=(0,e.template)(`<section class=gs-setup aria-label=Setup>`),Sn=(0,e.template)(`<p class=gs-alert role=alert>Scans need <!> on OpenCode's PATH.`),Cn=(0,e.template)(`<span class="gs-mono gs-muted gs-block">`),wn=(0,e.template)(`<dt>Profile`),Tn=(0,e.template)(`<option value disabled>Choose a profile`),En=(0,e.template)(`<dd><select aria-label=Profile class=gs-select>`),Dn=(0,e.template)(`<dl class=gs-setup-grid><dt>Provider</dt><dd></dd><dt>Model</dt><dd> · </dd><dt>Credentials</dt><dd>`),On=(0,e.template)(`<details class=gs-disclosure><summary>Configuration files</summary><p class=gs-mono></p><p class=gs-mono>`),kn=(0,e.template)(`<option>`),An=(0,e.template)(`<div class=gs-signin>`),jn=(0,e.template)(`<p>`),Mn=(0,e.template)(`<div class=gs-actions><button class=gs-button>Sign in with ChatGPT</button><button class=gs-link>Use a device code`),Nn=(0,e.template)(`<strong class=gs-code>`),Pn=(0,e.template)(`<p> <a target=_blank rel=noreferrer>`),Fn=(0,e.template)(`<button class=gs-link>Cancel sign-in`);function In(e){let t=e;if(!t?.route||!Array.isArray(t.profiles)||!t.runtime)throw Error(`Could not read the setup. Update the server plugin and reopen Security.`);return t}var Ln={chatgpt:`ChatGPT sign-in`,"api-key":`API key from the environment`,aws:`AWS credentials`};function Rn(t){let[r,i]=(0,n.createSignal)(),[a,o]=(0,n.createSignal)(``),[s,c]=(0,n.createSignal)(!1),l=!1;(0,n.onCleanup)(()=>l=!0);let u=async()=>{try{let e=In(await t.setup.load());if(l)return;i(e),o(``)}catch(e){l||o(V(e))}},d=async e=>{if(!s()&&e){c(!0),o(``);try{await e(),await u()}catch(e){l||o(V(e))}finally{l||c(!1)}}};(0,n.createEffect)(()=>{if(!r()?.signIn?.pending)return;let e=setInterval(()=>void u(),2e3);(0,n.onCleanup)(()=>clearInterval(e))});let f=async e=>{if(!s()){c(!0),o(``);try{await t.setup.setProfile({profile:e}),await u(),t.onChange?.()}catch(e){l||o(V(e))}finally{l||c(!1)}}};u();let p=()=>{let e=r()?.runtime;return e?ce(e):[]};return(()=>{var i=xn();return(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return a()},get children(){var t=bn(),n=t.firstChild,r=n.nextSibling;return(0,e.insert)(t,a,n),r.$$click=()=>void u(),t}}),null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return r()},children:r=>[(0,e.createComponent)(n.Show,{get when(){return p().length},get children(){var t=Sn(),n=t.firstChild.nextSibling;return n.nextSibling,(0,e.insert)(t,()=>p().join(` and `),n),t}}),(()=>{var t=Dn(),i=t.firstChild.nextSibling,a=i.nextSibling.nextSibling,o=a.firstChild,c=a.nextSibling.nextSibling;return(0,e.insert)(i,()=>r().route.provider,null),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return r().route.baseUrl},get children(){var t=Cn();return(0,e.insert)(t,()=>r().route.baseUrl),t}}),null),(0,e.insert)(a,()=>r().route.model,o),(0,e.insert)(a,()=>r().route.reasoningEffort,null),(0,e.insert)(a,()=>r().route.daybreak?` · Daybreak`:``,null),(0,e.insert)(c,()=>Ln[r().route.auth]??r().route.auth),(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return r().profiles.length>1},get children(){return[wn(),(()=>{var t=En(),i=t.firstChild;return i.addEventListener(`change`,e=>void f(e.currentTarget.value)),(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return!r().profile},get children(){return Tn()}}),null),(0,e.insert)(i,(0,e.createComponent)(n.For,{get each(){return r().profiles},children:t=>(()=>{var n=kn();return n.value=t,(0,e.insert)(n,t),n})()}),null),(0,e.effect)(()=>i.disabled=s()),(0,e.effect)(()=>i.value=r().profile??``),t})()]}}),null),t})(),(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>!!(r().signIn&&t.setup.signIn))()?r().signIn:void 0},children:r=>(0,e.createComponent)(n.Show,{get when(){return r().state!==`signed-in`||r().pending},get children(){var i=An();return(0,e.insert)(i,(0,e.createComponent)(n.Show,{get when(){return r().pending},get fallback(){return[(()=>{var t=jn();return(0,e.insert)(t,()=>ue(r())),(0,e.effect)(()=>(0,e.className)(t,r().state===`needed`?`gs-note`:`gs-muted`)),t})(),(()=>{var n=Mn(),r=n.firstChild,i=r.nextSibling;return r.$$click=()=>void d(()=>t.setup.signIn({})),i.$$click=()=>void d(()=>t.setup.signIn({device:!0})),(0,e.effect)(e=>{var t=s(),n=s();return t!==e.e&&(r.disabled=e.e=t),n!==e.t&&(i.disabled=e.t=n),e},{e:void 0,t:void 0}),n})()]},children:r=>[(()=>{var t=Pn(),i=t.firstChild,a=i.nextSibling;return(0,e.insert)(t,(0,e.createComponent)(n.Show,{get when(){return r().code},fallback:`Finish signing in in your browser. If it did not open:`,get children(){return[`Enter code `,(()=>{var t=Nn();return(0,e.insert)(t,()=>r().code),t})(),` at:`]}}),i),(0,e.insert)(a,()=>r().url),(0,e.effect)(()=>(0,e.setAttribute)(a,`href`,r().url)),t})(),(()=>{var n=Fn();return n.$$click=()=>void d(t.setup.signInCancel),(0,e.effect)(()=>n.disabled=s()),n})()]})),i}})}),(()=>{var t=On(),n=t.firstChild.nextSibling,i=n.nextSibling;return(0,e.insert)(n,()=>r().configFile),(0,e.insert)(i,()=>r().codexConfigFile),t})()]}),null),i})()}(0,e.delegateEvents)([`click`]);var zn=`
/* ---------- Tokens ---------- */
.gill-security {
  --gs-f-bg: #161616;
  --gs-f-surface: #242424;
  --gs-f-fg: #fafafa;
  --gs-f-muted: #aeaeae;
  --gs-f-line: rgba(255, 255, 255, 0.1);
  --gs-f-line-strong: rgba(255, 255, 255, 0.2);
  --gs-f-hover: rgba(255, 255, 255, 0.06);
  --gs-f-accent-text: #a2bcff;
  --gs-f-success: #6bd586;
  --gs-f-warning: #f2cf76;
  --gs-f-danger: #f17471;
  --gs-f-danger-bg: #461516;
  --gs-f-danger-line: #97252b;

  --gs-bg: var(--v2-background-bg-base, var(--background-base, var(--gs-f-bg)));
  --gs-surface: var(--v2-background-bg-layer-01, var(--surface-raised-base, var(--gs-f-surface)));
  --gs-fg: var(--v2-text-text-base, var(--text-base, var(--gs-f-fg)));
  --gs-muted: var(--v2-text-text-muted, var(--text-weak, var(--gs-f-muted)));
  --gs-line: var(--v2-border-border-base, var(--border-base, var(--gs-f-line)));
  --gs-line-strong: var(--v2-border-border-strong, var(--gs-f-line-strong));
  --gs-hover: var(--v2-overlay-simple-overlay-hover, var(--gs-f-hover));
  --gs-focus: var(--v2-border-border-focus, #7698fd);
  --gs-accent: var(--v2-background-bg-accent, #3b5cf6);
  --gs-on-accent: var(--v2-text-text-contrast, #fff);
  --gs-accent-text: var(--v2-text-text-accent, var(--gs-f-accent-text));
  --gs-success: var(--v2-state-fg-success, var(--gs-f-success));
  --gs-warning: var(--v2-state-fg-warning, var(--gs-f-warning));
  --gs-danger: var(--v2-state-fg-danger, var(--gs-f-danger));
  --gs-danger-bg: var(--v2-state-bg-danger, var(--gs-f-danger-bg));
  --gs-danger-line: var(--v2-state-border-danger, var(--gs-f-danger-line));
  /* Yellow alone is too light on a light background; pull it toward the text colour. */
  --gs-warning-text: color-mix(in srgb, var(--gs-warning) 70%, var(--gs-fg));
  --gs-font-mono: var(--v2-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  --gs-radius: 6px;
}
@media (prefers-color-scheme: light) {
  .gill-security {
    --gs-f-bg: #ffffff;
    --gs-f-surface: #fafafa;
    --gs-f-fg: #161616;
    --gs-f-muted: #5c5c5c;
    --gs-f-line: rgba(0, 0, 0, 0.1);
    --gs-f-line-strong: rgba(0, 0, 0, 0.2);
    --gs-f-hover: rgba(0, 0, 0, 0.04);
    --gs-f-accent-text: #3b5cf6;
    --gs-f-success: #198b43;
    --gs-f-warning: #cb9f34;
    --gs-f-danger: #b82d35;
    --gs-f-danger-bg: #fceceb;
    --gs-f-danger-line: #f2bbb7;
  }
}

/* ---------- Base ---------- */
.gill-security {
  height: 100%;
  overflow: auto;
  container-type: inline-size;
  background: var(--gs-bg);
  color: var(--gs-fg);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  scrollbar-width: thin;
  scrollbar-color: var(--gs-line-strong) transparent;
}
.gill-security *,
.gill-security *::before,
.gill-security *::after {
  box-sizing: border-box;
}
.gill-security :where(h2, h3, h4, p, dl, dd, ol, ul, pre, fieldset) {
  margin: 0;
}
.gill-security :where(button, input, select, textarea) {
  font: inherit;
  color: inherit;
}
.gill-security button {
  cursor: pointer;
}
.gill-security button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.gill-security :focus-visible {
  outline: 2px solid var(--gs-focus);
  outline-offset: 2px;
}
.gill-security summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
  list-style: none;
}
.gill-security summary::-webkit-details-marker {
  display: none;
}
/* One chevron for every disclosure, pointing down when open. */
.gill-security summary::before {
  content: '';
  flex-shrink: 0;
  align-self: center;
  width: 5px;
  height: 5px;
  margin: 0 3px 0 1px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  opacity: 0.7;
}
.gill-security details[open] > summary::before {
  transform: rotate(45deg);
}
.gs-report {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.gill-security pre {
  font: 12px/1.6 var(--gs-font-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 360px;
  overflow: auto;
  padding: 10px 12px;
  background: var(--gs-surface);
  border: 1px solid var(--gs-line);
  border-radius: var(--gs-radius);
}
.gs-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 24px 32px;
}

/* ---------- Utilities ---------- */
.gs-muted {
  color: var(--gs-muted);
}
.gs-mono {
  font-family: var(--gs-font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.gs-wrap {
  overflow-wrap: anywhere;
}
.gs-block {
  display: block;
}
.gs-tabular {
  font-variant-numeric: tabular-nums;
}
.gs-danger {
  color: var(--gs-danger);
}

/* ---------- Buttons ---------- */
.gs-button {
  padding: 6px 12px;
  border: 1px solid var(--gs-line-strong);
  border-radius: var(--gs-radius);
  background: transparent;
  line-height: 1.4;
  white-space: nowrap;
}
.gs-button:hover:not(:disabled) {
  background: var(--gs-hover);
}
.gs-button.gs-primary {
  border-color: transparent;
  background: var(--gs-accent);
  color: var(--gs-on-accent);
  font-weight: 600;
}
.gs-button.gs-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}
.gs-link {
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--gs-accent-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.gs-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 14px;
}

/* ---------- Notices ---------- */
.gs-alert {
  padding: 8px 12px;
  border: 1px solid var(--gs-danger-line);
  border-radius: var(--gs-radius);
  background: var(--gs-danger-bg);
  color: var(--gs-fg);
  overflow-wrap: anywhere;
}
.gs-note {
  margin-top: 12px;
  color: var(--gs-muted);
}
.gs-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--gs-line);
  border-radius: var(--gs-radius);
  background: var(--gs-surface);
}
.gs-empty h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
.gs-empty p {
  color: var(--gs-muted);
}
.gs-footer {
  font-size: 12px;
}

/* ---------- Header and tabs ---------- */
.gs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.gs-header h2 {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.gs-header p {
  font-size: 12px;
}
.gs-tabs {
  display: flex;
  gap: 20px;
  border-bottom: 1px solid var(--gs-line);
}
.gs-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: -1px;
  padding: 6px 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--gs-muted);
  font-weight: 500;
}
.gs-tabs button:hover {
  color: var(--gs-fg);
}
.gs-tabs button[aria-current='page'] {
  color: var(--gs-fg);
  border-bottom-color: var(--gs-accent);
}
.gs-badge {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--gs-accent);
  color: var(--gs-on-accent);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

/* ---------- Setup card ---------- */
.gs-setup {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--gs-line);
  border-radius: var(--gs-radius);
  background: var(--gs-surface);
}
.gs-setup-grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 16px;
  align-items: baseline;
}
.gs-setup-grid dt {
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-setup-grid dd {
  overflow-wrap: anywhere;
}
.gs-select {
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--gs-line-strong);
  border-radius: var(--gs-radius);
  background: var(--gs-bg);
}

/* ---------- Disclosures and sections ---------- */
.gs-disclosure {
  margin-top: 10px;
}
.gs-disclosure > summary {
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-disclosure > summary:hover {
  color: var(--gs-fg);
}
.gs-disclosure[open] > summary {
  margin-bottom: 8px;
}
.gs-disclosure p + p {
  margin-top: 6px;
}
.gs-section {
  border-top: 1px solid var(--gs-line);
}
.gs-section > summary {
  padding: 12px 0;
  font-weight: 500;
}
.gs-section[open] {
  padding-bottom: 14px;
}
.gs-section[open] > summary {
  margin-bottom: 4px;
}
.gs-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.gs-section-heading h3 {
  font-size: 14px;
  font-weight: 600;
}

/* ---------- Definition lists ---------- */
.gs-facts dt {
  margin-top: 10px;
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-facts dt:first-child {
  margin-top: 0;
}
.gs-facts dd {
  margin-top: 2px;
  overflow-wrap: anywhere;
}
/* Item rows under a counted heading, e.g. coverage surfaces. */
.gs-facts dd + dd {
  padding-left: 12px;
}

/* ---------- Forms ---------- */
.gs-form fieldset {
  min-width: 0;
  padding: 0;
  border: 0;
}
.gs-form label {
  display: block;
  margin-bottom: 14px;
  font-size: 12px;
  font-weight: 500;
}
.gs-form :where(input, textarea, select) {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 7px 10px;
  border: 1px solid var(--gs-line-strong);
  border-radius: var(--gs-radius);
  background: var(--gs-surface);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}
.gs-form :where(input, textarea, select):focus-visible {
  outline-offset: 0;
  border-color: var(--gs-focus);
}
.gs-form textarea {
  min-height: 64px;
  resize: vertical;
}
.gs-form ::placeholder {
  color: var(--gs-muted);
  opacity: 0.8;
}
.gs-help {
  display: block;
  margin-top: 4px;
  color: var(--gs-muted);
  font-weight: 400;
}

/* ---------- Composer and review ---------- */
.gs-composer {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--gs-line);
}
.gs-composer:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.gs-intro {
  margin: -4px 0 16px;
  color: var(--gs-muted);
}
.gs-composer > .gs-alert,
.gs-composer > p {
  margin-bottom: 14px;
}
.gs-review {
  padding: 14px 16px;
  border: 1px solid var(--gs-line);
  border-radius: 8px;
}
.gs-review h3 {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}
.gs-approval {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--gs-line);
}
.gs-approval > p + p {
  margin-top: 6px;
}
.gs-approval .gs-disclosure p {
  color: var(--gs-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

/* ---------- Lists (scan history, operations) ---------- */
.gs-runs > summary {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--gs-line);
  font-size: 12px;
}
.gs-runs[open] > summary {
  margin-bottom: 6px;
}
.gs-list {
  max-height: 260px;
  overflow: auto;
  padding: 0;
  list-style: none;
}
.gs-list li + li {
  border-top: 1px solid var(--gs-line);
}
.gs-list-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--gs-radius);
  background: none;
  text-align: left;
}
.gs-list-item:hover {
  background: var(--gs-hover);
}
.gs-list-item[aria-pressed='true'] {
  border-color: var(--gs-line-strong);
  background: color-mix(in srgb, var(--gs-accent) 10%, transparent);
}
.gs-list-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}
.gs-list-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.gs-list-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-status {
  flex-shrink: 0;
  white-space: nowrap;
  color: var(--gs-muted);
  font-size: 11px;
}
.gs-status:is([data-status='running'], [data-status='prepared']) {
  color: var(--gs-accent-text);
}
.gs-status[data-status='awaiting_answers'] {
  color: var(--gs-warning-text);
}
.gs-status:is([data-status='error'], [data-status='failed']) {
  color: var(--gs-danger);
}
.gs-status[data-status='completed'] {
  color: var(--gs-success);
}

/* ---------- Run detail ---------- */
.gs-detail {
  display: flex;
  flex-direction: column;
}
.gs-detail-title {
  margin-bottom: 18px;
}
.gs-detail-title h3 {
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.gs-detail-title p {
  margin-top: 2px;
  font-size: 12px;
}
.gs-progress-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
}
.gs-progress-heading h3 {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
}
.gs-progress-heading h3[data-status='error'] {
  color: var(--gs-danger);
}
.gs-progress-heading span {
  font-size: 12px;
  white-space: nowrap;
}
.gs-progress {
  display: block;
  width: 100%;
  height: 6px;
  margin: 14px 0 8px;
  border: 0;
  border-radius: 3px;
  overflow: hidden;
  appearance: none;
  background: var(--gs-line);
}
.gs-progress::-webkit-progress-bar {
  background: var(--gs-line);
}
.gs-progress::-webkit-progress-value {
  background: var(--gs-accent);
}
.gs-progress::-moz-progress-bar {
  background: var(--gs-accent);
}
.gs-progress-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  font-size: 12px;
}
.gs-scan-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin: 12px 0 16px;
  font-size: 12px;
}
.gs-detail > .gs-alert,
.gs-detail > .gs-note {
  margin: 0 0 16px;
}
.gs-lede {
  margin-bottom: 20px;
  max-width: 64ch;
}
.gs-detail > .gs-empty {
  margin-bottom: 16px;
}

/* ---------- Findings ---------- */
.gs-findings {
  margin: 8px 0 20px;
}
.gs-findings .gs-section-heading h3 {
  font-size: 16px;
}
.gs-finding {
  border-top: 1px solid var(--gs-line);
}
.gs-finding:last-child {
  border-bottom: 1px solid var(--gs-line);
}
.gs-finding > summary {
  gap: 10px;
  padding: 10px 0;
  font-weight: 500;
}
.gs-finding-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
}
.gs-finding-body h4 {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
}
.gs-severity {
  flex-shrink: 0;
  min-width: 56px;
  color: var(--gs-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.gs-severity:is([data-severity='critical'], [data-severity='high']) {
  color: var(--gs-danger);
}
.gs-severity[data-severity='medium'] {
  color: var(--gs-warning-text);
}
.gs-runs > summary > .gs-muted {
  margin-left: auto;
}
.gs-finding-validation {
  padding-top: 4px;
}
.gs-finding-validation .gs-actions {
  margin-top: 0;
}
.gs-finding-validation .gs-operation + .gs-actions {
  margin-top: 10px;
}

/* ---------- Coverage, activity, details ---------- */
.gs-outcome > p {
  margin-bottom: 12px;
  font-size: 12px;
}
.gs-coverage > p,
.gs-coverage > .gs-facts {
  margin-bottom: 10px;
}
.gs-activity > p {
  margin-bottom: 8px;
  font-size: 12px;
}
.gs-workers {
  padding: 0;
  list-style: none;
}
.gs-workers li {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--gs-line);
  font-size: 12px;
}
.gs-worker-name {
  color: var(--gs-muted);
}
.gs-worker-label {
  overflow-wrap: anywhere;
}
.gs-timeline {
  max-height: 240px;
  overflow: auto;
  padding: 0;
  list-style: none;
}
.gs-timeline li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 4px 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.gs-timeline time {
  flex-shrink: 0;
  color: var(--gs-muted);
  font-variant-numeric: tabular-nums;
}
.gs-info .gs-facts {
  font-size: 12px;
}

/* ---------- Policy and validation ---------- */
.gs-operations {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.gs-operations > .gs-section-heading {
  margin-bottom: 0;
}
.gs-operations > .gs-detail h3 {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}
.gs-operation {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gs-operation-compact {
  padding: 12px;
  border: 1px solid var(--gs-line);
  border-radius: var(--gs-radius);
  background: var(--gs-surface);
}
.gs-operation-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.gs-operation .gs-approval {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
.gs-operation .gs-actions {
  margin-top: 4px;
}
.gs-questions {
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--gs-warning) 45%, transparent);
  border-radius: var(--gs-radius);
  background: color-mix(in srgb, var(--gs-warning) 8%, transparent);
}
.gs-questions h4 {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}
.gs-questions ol {
  margin-bottom: 12px;
  padding-left: 20px;
}
.gs-questions li + li {
  margin-top: 4px;
}
.gs-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gs-disposition {
  font-weight: 600;
}
.gs-disposition[data-disposition='reportable'] {
  color: var(--gs-danger);
}
.gs-disposition:is([data-disposition='suppressed'], [data-disposition='not_applicable']) {
  color: var(--gs-success);
}
.gs-disposition[data-disposition='deferred'] {
  color: var(--gs-warning-text);
}

/* ---------- Narrow panels ---------- */
@container (max-width: 440px) {
  .gs-body {
    gap: 16px;
    padding: 16px 16px 24px;
  }
  .gs-progress-heading h3 {
    font-size: 19px;
  }
  .gs-banner {
    flex-direction: column;
    align-items: flex-start;
  }
  .gs-workers li {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 0;
  }
  .gs-worker-name {
    grid-column: 1 / -1;
  }
  .gs-tabs {
    gap: 16px;
  }
}

/* Sign-in */
.gs-signin {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--gs-line);
}
.gs-signin p {
  margin: 0 0 8px;
  overflow-wrap: anywhere;
}
.gs-signin a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.gs-code {
  font-family: var(--gs-mono, ui-monospace, monospace);
  letter-spacing: 0.08em;
}
`,Bn=(0,e.template)(`<button class="gs-button gs-primary">New scan`),Vn=(0,e.template)(`<span class=gs-badge>`),Hn=(0,e.template)(`<nav class=gs-tabs aria-label="Security views"><button>Scans</button><button>Policy and validation`),Un=(0,e.template)(`<p class=gs-alert role=alert> <button class=gs-link>Retry`),Wn=(0,e.template)(`<div class=gs-banner><span>A policy draft is waiting for your answers.</span><button class=gs-button>Answer`),Gn=(0,e.template)(`<p class=gs-alert role=alert>`),Kn=(0,e.template)(`<section class=gill-security aria-label=Security><style></style><div class=gs-body><header class=gs-header><div><h2>Security</h2><p class=gs-muted>`),qn=(0,e.template)(`<div class=gs-banner><span class=gs-wrap>A prepared scan is ready: </span><button class=gs-button>Review`),Jn={};function Yn(t){let r=_e({port:t.port,operations:t.operations,fallbackMs:t.fallbackMs}),[i,a]=(0,n.createSignal)(`scans`),[o,s]=(0,n.createSignal)(),[c,l]=(0,n.createSignal)(),u=()=>r.catalog.runs,d=(0,n.createMemo)(()=>u().find(e=>e.runId===o())??u()[0]),f=(0,n.createMemo)(()=>me(r.catalog,r.now())?.plan),p=()=>c()??(r.loaded()&&!u().length?Jn:void 0),h=()=>t.operations?.capabilities,g=()=>!!t.operations&&r.loaded(),_=()=>t.operations&&(h()?.validation??!0)?t.operations:void 0,v=()=>r.operations().filter(e=>e.status===`awaiting_answers`).length;return(()=>{var o=Kn(),c=o.firstChild,y=c.nextSibling,b=y.firstChild,x=b.firstChild.firstChild.nextSibling;return(0,e.insert)(c,zn),(0,e.insert)(x,()=>m(t.directory),null),(0,e.insert)(x,(()=>{var t=(0,e.memo)(()=>!!r.running());return()=>t()?` · ${r.running()} running`:``})(),null),(0,e.insert)(b,(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>i()===`scans`)()&&!p()},get children(){var e=Bn();return e.$$click=()=>l({}),e}}),null),(0,e.insert)(y,(0,e.createComponent)(n.Show,{get when(){return t.setup},children:t=>(0,e.createComponent)(Rn,{get setup(){return t()},onChange:()=>void r.refresh()})}),null),(0,e.insert)(y,(0,e.createComponent)(n.Show,{get when(){return g()},get children(){var t=Hn(),r=t.firstChild,o=r.nextSibling;return o.firstChild,r.$$click=()=>a(`scans`),o.$$click=()=>a(`operations`),(0,e.insert)(o,(0,e.createComponent)(n.Show,{get when(){return v()},get children(){var t=Vn();return(0,e.insert)(t,v),t}}),null),(0,e.effect)(t=>{var n=i()===`scans`?`page`:void 0,a=i()===`operations`?`page`:void 0;return n!==t.e&&(0,e.setAttribute)(r,`aria-current`,t.e=n),a!==t.t&&(0,e.setAttribute)(o,`aria-current`,t.t=a),t},{e:void 0,t:void 0}),t}}),null),(0,e.insert)(y,(0,e.createComponent)(n.Show,{get when(){return r.connectionError()},get children(){var t=Un(),n=t.firstChild,i=n.nextSibling;return(0,e.insert)(t,()=>r.connectionError(),n),i.$$click=()=>void r.refresh(),t}}),null),(0,e.insert)(y,(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>i()===`operations`)()&&t.operations},children:n=>(0,e.createComponent)(nt,{get directory(){return t.directory},get port(){return n()},store:r,get policy(){return h()?.policy??!0}})}),null),(0,e.insert)(y,(0,e.createComponent)(n.Show,{get when(){return i()===`scans`},get children(){return[(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>!!v())()&&g()},get children(){var e=Wn(),t=e.firstChild.nextSibling;return t.$$click=()=>a(`operations`),e}}),(0,e.createComponent)(n.Show,{get when(){return r.catalog.historyError},get children(){var t=Gn();return(0,e.insert)(t,()=>r.catalog.historyError),t}}),(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>!p())()&&f()},children:t=>(()=>{var n=qn(),r=n.firstChild;r.firstChild;var i=r.nextSibling;return(0,e.insert)(r,()=>t().repository,null),i.$$click=()=>l({plan:t()}),n})()}),(0,e.createComponent)(n.Show,{get when(){return p()},keyed:!0,children:n=>(0,e.createComponent)(yn,{get directory(){return t.directory},get port(){return t.port},store:r,get plan(){return n.plan},get onClose(){return u().length?()=>l(void 0):void 0},onStarted:e=>{s(e),l(void 0)}})}),(0,e.createComponent)(n.Show,{get when(){return u().length},get children(){return(0,e.createComponent)(nn,{get runs(){return u()},get selectedId(){return d()?.runId},onSelect:s})}}),(0,e.createComponent)(n.Show,{get when(){return d()?.runId},keyed:!0,children:i=>(0,e.createComponent)(n.Show,{get when(){return(0,e.memo)(()=>d()?.runId===i)()?d():void 0},children:n=>(0,e.createComponent)($t,{get run(){return n()},get port(){return t.port},store:r,get validation(){return _()}})})})]}}),null),(0,e.effect)(()=>(0,e.setAttribute)(x,`title`,t.directory)),o})()}(0,e.delegateEvents)([`click`]);var Xn=(0,e.template)(`<section style=padding:24px><h2>Security</h2><p>Open a local project session to scan it.`),Zn=t.Plugin.define({setup(r){let i={id:`security`,title:`Security`,tabbable:!0},a=`${r.id}:${i.id}`,o=()=>r.client.rpc(p),s=(e,t,n)=>{let i=new AbortController;return(async()=>{for(;!i.signal.aborted&&!r.signal.aborted;){try{for await(let r of o().events.subscribe(e,{signal:i.signal}))r.location.directory===t&&n()}catch{}if(i.signal.aborted)return;await new Promise(e=>setTimeout(e,5e3)),n()}})(),()=>i.abort()};r.add(t.Panel,{id:i.id,region:`side`,width:580,list:e=>e.open.includes(i.id)?[i]:[],render(t){let r=(0,n.createMemo)(()=>fe(t.session));return(0,e.createComponent)(n.Show,{get when(){return r()},keyed:!0,get fallback(){return Xn()},children:t=>{let r={directory:t},[i,a]=(0,n.createSignal)(),c=!1;return(0,n.onCleanup)(()=>c=!0),o().capabilities({},{location:r}).then(e=>{let t=e;!c&&(t.policy||t.validation)&&a(t)}).catch(()=>{}),(0,e.createComponent)(Yn,{directory:t,port:{list:()=>o().list({},{location:r}),prepare:e=>o().prepare(e,{location:r}),start:e=>o().start(e,{location:r}),cancel:e=>o().cancel(e,{location:r}),subscribe:e=>{let n=[`changed`,`operationChanged`].map(n=>s(n,t,()=>e(n)));return()=>n.forEach(e=>e())}},setup:{load:()=>o().setup({},{location:r}),setProfile:e=>o().setProfile(e,{location:r}),signIn:e=>o().signIn(e,{location:r}),signInCancel:()=>o().signInCancel({},{location:r})},get operations(){return(0,e.memo)(()=>!!i())()?{capabilities:i(),list:()=>o().operationList({},{location:r}),prepare:e=>o().operationPrepare(e,{location:r}),start:e=>o().operationStart(e,{location:r}),answer:e=>o().operationAnswer(e,{location:r}),cancel:e=>o().operationCancel(e,{location:r}),resolve:e=>o().operationResolve(e,{location:r})}:void 0}})}})}});let c=e=>{e?r.layout.open(a,e):r.toast.show({title:`Open a local project session to use Security`})};r.add(t.MenuItem,()=>{let e=r.sessions.current();return{menu:`session.panel`,id:`open`,title:`Security`,icon:`shield`,...e&&r.layout.stored(e).includes(i.id)?{opened:!0}:{},run:()=>c(r.sessions.current())}}),r.add(t.Command,{id:`open`,title:`Security: open scans`,group:`Security`,slash:{name:`security`},run:()=>c(r.sessions.current())})}});exports.default=Zn;