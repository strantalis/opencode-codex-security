/** The bundled skill: how the session model runs a scan that needs other repositories. */
export const skill = {
  id: 'codex-security',
  name: 'Codex Security',
  description:
    'Run a Codex Security scan of a repository with its dependencies and deployment repositories (GitOps, Terraform) as context, or draft a SECURITY.md policy for a repository.',
  path: 'skill://codex-security/SKILL.md',
  content: `Use this when the user asks for a security scan that involves more than the current workspace, or for a security policy.

1. Ask which repositories matter: the target, dependencies whose source the scan should follow, and repositories that describe deployment (GitOps, Terraform or other IaC). Ask for a ref for each.

2. Use local checkouts where the user has them. Otherwise shallow-clone each at its ref into a workspace folder:
   \`\${XDG_CACHE_HOME:-~/.cache}/opencode/codex-security/workspaces/<name>/\`
   Put the target and followed dependencies in \`app/\` and the deployment repositories in \`context/\`. Do not use the system temp directory: Deep scans run for hours and validation later needs the same files.

3. Read the deployment repositories and write \`context/deployment.md\`: what is internet-facing, the environments, IAM roles and trust boundaries, and the commit of every checkout. Keep it short and factual.

4. Choose the scan:
   - Default: \`repository\` is the target checkout. \`contextFiles\` holds the absolute path of \`deployment.md\` and the few infrastructure files that matter.
   - When the user wants data flow followed across repositories: \`repository\` is the \`app/\` folder and \`scopePaths\` point into each checkout's source, for example \`api/src\`. This costs more; say so and let the user choose.

   - To check only recent work, pass \`changes\`: "uncommitted", or a base ref such as "origin/main".

5. Call security_scan. Tell the user it runs in the background. A notice arrives in this session when it ends; then call security_scan_results and report the findings by severity.

6. Offer security_validate for findings the user cares about, and security_fix to propose a fix: it returns a diff, and you call security_apply_fix only after the user accepts it.

7. A SECURITY.md policy belongs to one repository and tells later scans what counts as a finding. On request, call security_policy with \`repository\` set to that repository's checkout, not the folder holding several, and the deployment summary as context. A notice arrives when it has questions or is done: read it with security_operations, ask the user, answer with security_answer_questions. Show the draft. It is written nowhere and only takes effect once committed to the real repository, so offer to write it there on a branch for the user to review and push. Do that only if they say yes.

8. When the user is done, delete the workspace folder.`,
};
