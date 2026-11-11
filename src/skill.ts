/** The bundled skill: how the session model runs a scan that needs other repositories. */
export const skill = {
  id: 'codex-security',
  name: 'Codex Security',
  description:
    'Run a Codex Security scan of a repository with its dependencies and deployment repositories (GitOps, Terraform) as context.',
  path: 'skill://codex-security/SKILL.md',
  content: `Use this when the user asks for a security scan that involves more than the current workspace.

1. Ask which repositories matter: the target, dependencies whose source the scan should follow, and repositories that describe deployment (GitOps, Terraform or other IaC). Ask for a ref for each.

2. Use local checkouts where the user has them. Otherwise shallow-clone each at its ref into a workspace folder:
   \`\${XDG_CACHE_HOME:-~/.cache}/opencode/codex-security/workspaces/<name>/\`
   Put the target and followed dependencies in \`app/\` and the deployment repositories in \`context/\`. Do not use the system temp directory: Deep scans run for hours and validation later needs the same files.

3. Read the deployment repositories and write \`context/deployment.md\`: what is internet-facing, the environments, IAM roles and trust boundaries, and the commit of every checkout. Keep it short and factual.

4. Choose the scan:
   - Default: \`repository\` is the target checkout. \`contextFiles\` holds the absolute path of \`deployment.md\` and the few infrastructure files that matter.
   - When the user wants data flow followed across repositories: \`repository\` is the \`app/\` folder and \`scopePaths\` point into each checkout's source, for example \`api/src\`. This costs more; say so and let the user choose.

5. Call security_scan. Tell the user it runs in the background. A notice arrives in this session when it ends; then call security_scan_results and report the findings by severity.

6. Offer security_validate for findings the user cares about. Offer security_policy with the deployment summary as context, so a SECURITY.md records these facts and later scans pick them up.

7. When the user is done, delete the workspace folder.`,
};
