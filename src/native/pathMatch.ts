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

/** True when `candidate` is `dir` itself or lives underneath it (case-insensitive). */
export function isSameOrInside(candidate: string, dir: string): boolean {
    const normalizedDir = path.resolve(dir);
    const normalizedCandidate = path.resolve(candidate);
    if (normalizedCandidate.toLowerCase() === normalizedDir.toLowerCase()) return true;
    const withSeparator = normalizedDir.endsWith(path.sep) ? normalizedDir : normalizedDir + path.sep;
    return normalizedCandidate.toLowerCase().startsWith(withSeparator.toLowerCase());
}

/** Appends `root`/`relPath` to the `basenameLower -> paths` candidate map. */
export function addCandidateTo(map: Map<string, string[]>, root: string, relPath: string): void {
    const fullPath = path.join(root, relPath);
    const nameLower = basenameLower(relPath);
    const list = map.get(nameLower);
    if (list) list.push(fullPath);
    else map.set(nameLower, [fullPath]);
}

/**
 * Picks the best candidate for `queryPath` from `candidatePaths`.
 * Prefers the longest matching path suffix; then a candidate inside one of
 * `preferredPrefixes` (the workspace folders — the search may reach beyond them
 * into the rest of the enclosing repository); then the shorter path, then
 * lexicographically, so results are deterministic. Candidates that do not share
 * even the basename (score 0) are ignored.
 */
export function matchCandidate(
    queryPath: string,
    candidatePaths: ReadonlyArray<string>,
    preferredPrefixes: ReadonlyArray<string> = []
): string | undefined {
    return rankCandidates(queryPath, candidatePaths, preferredPrefixes)[0];
}

/**
 * Same ordering as `matchCandidate`, but returns every plausible candidate best
 * first. The caller walks the list until one passes a `stat`, so a stale index
 * entry (sparse checkout, a deleted file) does not sink the whole frame.
 */
export function rankCandidates(
    queryPath: string,
    candidatePaths: ReadonlyArray<string>,
    preferredPrefixes: ReadonlyArray<string> = []
): string[] {
    const isPreferred = (candidatePath: string): boolean =>
        preferredPrefixes.some(prefix => isSameOrInside(candidatePath, prefix));

    const scored = new Map<string, { score: number; preferred: boolean }>();
    for (const candidatePath of candidatePaths) {
        if (scored.has(candidatePath)) continue;
        const score = trailingMatchLength(queryPath, candidatePath);
        if (score === 0) continue;
        scored.set(candidatePath, { score, preferred: isPreferred(candidatePath) });
    }

    return [...scored.keys()].sort((a, b) => {
        const left = scored.get(a)!;
        const right = scored.get(b)!;
        if (left.score !== right.score) return right.score - left.score;
        if (left.preferred !== right.preferred) return left.preferred ? -1 : 1;
        return isBetterTieBreak(a, b) ? -1 : 1;
    });
}

function isBetterTieBreak(candidate: string, current: string): boolean {
    if (candidate.length !== current.length) return candidate.length < current.length;
    return candidate < current;
}
