import * as path from "node:path";

// Pure, vscode-free path matching helpers shared by the fast file searcher.
// Everything here works on plain string paths so it can be unit-tested directly
// under vitest (no VS Code runtime).

/** Splits a raw (possibly Windows/backslash) path into non-empty segments. */
export function splitPathSegments(filePath: string): string[] {
    return filePath.split(/[\/\\]/).filter(segment => segment.length > 0);
}

/** Lowercased basename of a raw path (handles both separators). */
export function basenameLower(filePath: string): string {
    const segments = filePath.split(/[\/\\]/);
    return (segments[segments.length - 1] ?? "").toLowerCase();
}

/**
 * String-only twin of `computeSmartCandidatePaths`: if a root directory's
 * on-disk name appears as a non-final segment of `filePath`, build the absolute
 * candidate by joining the root with the remaining segments.
 */
export function computeSmartCandidatePathsPure(filePath: string, rootPaths: ReadonlyArray<string>): string[] {
    const parts = filePath.split(/[\/\\]/);
    const results: string[] = [];
    for (const rootPath of rootPaths) {
        const rootSegments = splitPathSegments(rootPath);
        const folderName = rootSegments[rootSegments.length - 1]?.toLowerCase();
        if (folderName == undefined) continue;
        for (let i = 0; i < parts.length - 1; i++) {
            if (parts[i]!.toLowerCase() === folderName) {
                results.push(path.join(rootPath, ...parts.slice(i + 1)));
            }
        }
    }
    return results;
}

/** Number of trailing segments shared by two paths (case-insensitive). */
export function trailingMatchLength(queryPath: string, candidatePath: string): number {
    const q = splitPathSegments(queryPath).map(s => s.toLowerCase());
    const c = splitPathSegments(candidatePath).map(s => s.toLowerCase());
    let score = 0;
    while (score < q.length && score < c.length && q[q.length - 1 - score] === c[c.length - 1 - score]) {
        score++;
    }
    return score;
}

/**
 * Picks the best candidate for `queryPath` from `candidatePaths`.
 * Prefers the longest matching path suffix; ties break to the shorter path,
 * then lexicographically, so results are deterministic. Candidates that do not
 * share even the basename (score 0) are ignored.
 */
export function matchCandidate(queryPath: string, candidatePaths: ReadonlyArray<string>): string | undefined {
    let best: { candidatePath: string; score: number } | undefined;
    for (const candidatePath of candidatePaths) {
        const score = trailingMatchLength(queryPath, candidatePath);
        if (score === 0) continue;
        if (best == undefined || score > best.score || (score === best.score && isBetterTieBreak(candidatePath, best.candidatePath))) {
            best = { candidatePath, score };
        }
    }
    return best?.candidatePath;
}

function isBetterTieBreak(candidate: string, current: string): boolean {
    if (candidate.length !== current.length) return candidate.length < current.length;
    return candidate < current;
}
