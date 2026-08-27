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

// --- workspace layouts git alone used to mishandle -------------------------

/** Writes `files` (relative path -> content) under `dir`, creating parents. */
function writeFiles(dir: string, files: Record<string, string>): void {
    for (const [relPath, content] of Object.entries(files)) {
        const target = path.join(dir, relPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
}

function initRepo(dir: string): string {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["add", "-A"], { cwd: dir });
    return dir;
}

function tempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "sta-layout-"));
}

const itGitLayout = hasGit() ? test : test.skip;

describe("workspace folder holding several repositories", () => {
    itGitLayout("resolves frames from every nested repo, and walks only the non-repo remainder", async () => {
        const container = tempDir();
        writeFiles(container, {
            // `dist` is in the walk's IGNORED_DIRS — resolving it proves git served repo-a,
            // rather than the filesystem walk quietly covering the whole container.
            "repo-a/src/Alpha.cs": "",
            "repo-a/dist/Tracked.cs": "",
            "repo-b/src/Beta.cs": "",
            "loose/src/Gamma.cs": "",
        });
        initRepo(path.join(container, "repo-a"));
        initRepo(path.join(container, "repo-b"));

        const resolved = await resolveFilePaths(
            ["src/Alpha.cs", "dist/Tracked.cs", "src/Beta.cs", "src/Gamma.cs"],
            [container]
        );

        expect(norm(resolved.get("src/Alpha.cs"))).toMatch(/repo-a\/src\/Alpha\.cs$/);
        expect(norm(resolved.get("dist/Tracked.cs"))).toMatch(/repo-a\/dist\/Tracked\.cs$/);
        expect(norm(resolved.get("src/Beta.cs"))).toMatch(/repo-b\/src\/Beta\.cs$/);
        // the leftover non-repo area is still covered, by the walk
        expect(norm(resolved.get("src/Gamma.cs"))).toMatch(/loose\/src\/Gamma\.cs$/);
    });

    itGitLayout("uses repo roots supplied by the host (vscode.git) for repos below the depth-1 probe", async () => {
        const container = tempDir();
        writeFiles(container, { "team/group/repo-c/dist/Deep.cs": "" });
        const deepRepo = initRepo(path.join(container, "team/group/repo-c"));

        // `dist` is pruned by the walk, so only a git scope for the deep repo can find this.
        const resolved = await resolveFilePaths(["dist/Deep.cs"], [container], { repoRoots: [deepRepo] });
        expect(norm(resolved.get("dist/Deep.cs"))).toMatch(/repo-c\/dist\/Deep\.cs$/);
    });
});

describe("workspace folder that is only part of one repository", () => {
    itGitLayout("widens to the repository top for frames outside the workspace folder", async () => {
        const base = tempDir();
        const repo = path.join(base, "monorepo");
        writeFiles(repo, {
            "services/api/src/Handler.cs": "",
            "libs/shared/src/Shared.cs": "",
        });
        initRepo(repo);

        const workspaceRoot = path.join(repo, "services/api");
        const resolved = await resolveFilePaths(["src/Handler.cs", "src/Shared.cs"], [workspaceRoot]);

        expect(norm(resolved.get("src/Handler.cs"))).toMatch(/services\/api\/src\/Handler\.cs$/);
        // lives in a sibling folder of the repo: only the widened query reaches it
        expect(norm(resolved.get("src/Shared.cs"))).toMatch(/libs\/shared\/src\/Shared\.cs$/);
    });

    itGitLayout("prefers a candidate inside the workspace folder when suffixes tie", async () => {
        const base = tempDir();
        const repo = path.join(base, "monorepo");
        writeFiles(repo, {
            ".gitignore": "**/generated/\n",
            "services/api/generated/Model.cs": "",
            "libs/shared/generated/Model.cs": "",
            "services/api/src/Handler.cs": "",
        });
        initRepo(repo);

        const workspaceRoot = path.join(repo, "services/api");
        const resolved = await resolveFilePaths(["generated/Model.cs"], [workspaceRoot]);

        expect(norm(resolved.get("generated/Model.cs"))).toMatch(/services\/api\/generated\/Model\.cs$/);
    });

    itGitLayout("keeps dependency directories out of the ignored-file query", async () => {
        const base = tempDir();
        const repo = path.join(base, "monorepo");
        writeFiles(repo, {
            ".gitignore": "node_modules/\n",
            "node_modules/some-pkg/Vendor.cs": "",
        });
        initRepo(repo);

        const resolved = await resolveFilePaths(["some-pkg/Vendor.cs"], [repo]);
        expect(resolved.get("some-pkg/Vendor.cs")).toBeUndefined();
    });
});
