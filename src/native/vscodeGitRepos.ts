import * as vscode from "vscode";

/**
 * Repository roots the built-in `vscode.git` extension already knows about.
 *
 * VS Code scans the workspace for repositories on its own (`git.autoRepositoryDetection`,
 * `git.repositoryScanMaxDepth`), so this is free knowledge the search planner uses to
 * place a git scope per repository — the case where a workspace folder holds several
 * repositories, or a repository holds submodules, which `git ls-files` never reports.
 *
 * Returns `[]` whenever the extension is unavailable; the planner then falls back to
 * `git rev-parse --show-toplevel` plus its own depth-1 probe.
 */
export function getKnownRepoRoots(): string[] {
    const api = getGitApi();
    if (api == undefined) return [];
    try {
        return (api.repositories ?? [])
            .map((repository: { rootUri?: vscode.Uri }) => repository.rootUri?.fsPath)
            .filter((rootPath: string | undefined): rootPath is string => rootPath != undefined);
    } catch {
        return [];
    }
}

function getGitApi(): { repositories?: Array<{ rootUri?: vscode.Uri }> } | undefined {
    try {
        const gitExtension = vscode.extensions.getExtension("vscode.git");
        if (!gitExtension || !gitExtension.isActive) return undefined;
        return gitExtension.exports.getAPI(1);
    } catch {
        return undefined;
    }
}
