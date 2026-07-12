import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { splitIntoTokens } from "../stackTraceSplitter";
import { resolveFilePaths } from "../native/candidateResolver";

const fixturesDir = path.join(__dirname, "fixtures");
const stackTrace = fs.readFileSync(path.join(fixturesDir, "sample-repo.stacktrace.txt"), "utf8");

function collectFilePaths(trace: string): string[] {
    const paths: string[] = [];
    for (const line of splitIntoTokens(trace)) {
        for (const [, meta] of line) {
            if (meta?.type === "FilePath") paths.push((meta as unknown as { filePath: string }).filePath);
        }
    }
    return paths;
}

function hasGit(): boolean {
    try {
        execFileSync("git", ["--version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

/** Creates a throwaway `sample-repo` copy, optionally turned into a git repo. */
function setupFixtureRepo(withGit: boolean): string {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "sta-fixture-"));
    const repo = path.join(base, "sample-repo");
    fs.cpSync(path.join(fixturesDir, "sample-repo"), repo, { recursive: true });
    if (withGit) {
        execFileSync("git", ["init", "-q"], { cwd: repo });
        execFileSync("git", ["add", "-A"], { cwd: repo });
    }
    return repo;
}

const norm = (p: string | undefined): string | undefined => p?.replace(/\\/g, "/");

function assertExpectedResolutions(resolved: Map<string, string | undefined>): void {
    // build-agent windows path → resolved by the smart-candidate stat
    expect(norm(resolved.get("C:/BuildAgent/work/abc/sample-repo/src/Utils/Helper.cs"))).toMatch(
        /sample-repo\/src\/Utils\/Helper\.cs$/
    );
    // suffix-only frames → resolved by basename lookup
    expect(norm(resolved.get("src/api/handlers/order_handler.go"))).toMatch(/sample-repo\/src\/api\/handlers\/order_handler\.go$/);
    expect(norm(resolved.get("src/lib/parser.py"))).toMatch(/sample-repo\/src\/lib\/parser\.py$/);
    expect(norm(resolved.get("src/components/button.jsx"))).toMatch(/sample-repo\/src\/components\/button\.jsx$/);
    // disambiguation: two Helper.cs exist, the deeper-suffix match must win
    expect(norm(resolved.get("Utils/Helper.cs"))).toMatch(/sample-repo\/src\/Utils\/Helper\.cs$/);
    // git-ignored generated file: git omits it, so the walk stage must find it
    expect(norm(resolved.get("generated/Gen.cs"))).toMatch(/sample-repo\/generated\/Gen\.cs$/);
    // a frame with no matching file must stay unresolved
    expect(resolved.get("nonexistent/Ghost.cs")).toBeUndefined();
}

describe("fast file search over a fixture repo", () => {
    const filePaths = collectFilePaths(stackTrace);

    test("extracts the expected file-path frames from the fixture stack trace", () => {
        expect(filePaths).toEqual(
            expect.arrayContaining([
                "C:/BuildAgent/work/abc/sample-repo/src/Utils/Helper.cs",
                "src/api/handlers/order_handler.go",
                "src/lib/parser.py",
                "src/components/button.jsx",
                "Utils/Helper.cs",
                "generated/Gen.cs",
                "nonexistent/Ghost.cs",
            ])
        );
    });

    const itGit = hasGit() ? test : test.skip;
    itGit("resolves frames via git ls-files", async () => {
        const repo = setupFixtureRepo(true);
        assertExpectedResolutions(await resolveFilePaths(filePaths, [repo]));
    });

    test("resolves frames via filesystem walk (non-git root)", async () => {
        const repo = setupFixtureRepo(false);
        assertExpectedResolutions(await resolveFilePaths(filePaths, [repo]));
    });

    itGit("resolves via filesystem walk when useGitIndex is disabled (git root)", async () => {
        const repo = setupFixtureRepo(true);
        assertExpectedResolutions(await resolveFilePaths(filePaths, [repo], { useGitIndex: false }));
    });
});
