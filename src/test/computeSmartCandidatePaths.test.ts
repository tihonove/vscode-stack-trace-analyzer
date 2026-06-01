import { vi } from "vitest";
import { computeSmartCandidatePaths } from "../workspaceFileResolver";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (uri: { path: string }, path: string) => ({ path: uri.path + "/" + path }),
    },
}));

function computeSmartCandidatePathStrings(
    filePath: string,
    folders: ReadonlyArray<{ uriPath: string }>
): string[] {
    return computeSmartCandidatePaths(
        filePath,
        folders.map(folder => ({ uri: { path: folder.uriPath } as any }))
    ).map(uri => (uri as any).path);
}

describe("computeSmartCandidatePaths", () => {
    test("returns absolute path when folder name matches path segment", () => {
        const result = computeSmartCandidatePathStrings(
            "/ci/build/my-repo/src/Utils/Helper.cs",
            [{ uriPath: "/home/user/my-repo" }]
        );
        expect(result).toEqual(["/home/user/my-repo/src/Utils/Helper.cs"]);
    });

    test("returns empty array when no folders", () => {
        const result = computeSmartCandidatePathStrings(
            "/ci/build/my-repo/src/Utils/Helper.cs",
            []
        );
        expect(result).toEqual([]);
    });

    test("returns empty array when folder name not found in path", () => {
        const result = computeSmartCandidatePathStrings(
            "/ci/build/my-repo/src/Utils/Helper.cs",
            [{ uriPath: "/home/user/other-project" }]
        );
        expect(result).toEqual([]);
    });

    test("is case-insensitive", () => {
        const result = computeSmartCandidatePathStrings(
            "C:/BuildAgent/work/hash/My-Repo/src/Utils/Helper.cs",
            [{ uriPath: "/home/user/my-repo" }]
        );
        expect(result).toEqual(["/home/user/my-repo/src/Utils/Helper.cs"]);
    });

    test("handles backslash separators in file path", () => {
        const result = computeSmartCandidatePathStrings(
            "C:\\BuildAgent\\work\\hash\\my-repo\\src\\Utils\\Helper.cs",
            [{ uriPath: "/home/user/my-repo" }]
        );
        expect(result).toEqual(["/home/user/my-repo/src/Utils/Helper.cs"]);
    });

    test("handles multiple folders, returns match for the correct one", () => {
        const result = computeSmartCandidatePathStrings(
            "/ci/build/repo-b/src/Utils/Helper.cs",
            [
                { uriPath: "/home/user/repo-a" },
                { uriPath: "/home/user/repo-b" },
            ]
        );
        expect(result).toEqual(["/home/user/repo-b/src/Utils/Helper.cs"]);
    });

    test("handles folder name appearing multiple times in path", () => {
        const result = computeSmartCandidatePathStrings(
            "/ci/foo/foo/foo/src/Helper.cs",
            [{ uriPath: "/home/user/foo" }]
        );
        expect(result).toEqual([
            "/home/user/foo/foo/foo/src/Helper.cs",
            "/home/user/foo/foo/src/Helper.cs",
            "/home/user/foo/src/Helper.cs",
        ]);
    });

    test("does not return candidate when folder name matches only the last segment", () => {
        const result = computeSmartCandidatePathStrings(
            "/ci/build/my-repo",
            [{ uriPath: "/home/user/my-repo" }]
        );
        expect(result).toEqual([]);
    });

    describe("Windows paths", () => {
        // On Windows `vscode.Uri.path` carries a leading slash and drive letter, e.g. `/c:/Users/user/my-repo`.
        test("resolves a backslash build-agent path against a Windows folder uri", () => {
            const result = computeSmartCandidatePathStrings(
                "C:\\BuildAgent\\work\\a1b2c3\\my-repo\\src\\Utils\\Helper.cs",
                [{ uriPath: "/c:/Users/user/my-repo" }]
            );
            expect(result).toEqual(["/c:/Users/user/my-repo/src/Utils/Helper.cs"]);
        });

        test("matches case-insensitively when the agent path casing differs from the folder", () => {
            const result = computeSmartCandidatePathStrings(
                "C:\\agent\\_work\\1\\s\\myrepo\\src\\App.cs",
                [{ uriPath: "/c:/Projects/MyRepo" }]
            );
            expect(result).toEqual(["/c:/Projects/MyRepo/src/App.cs"]);
        });

        test("handles mixed forward and backslashes in one path", () => {
            const result = computeSmartCandidatePathStrings(
                "C:\\BuildAgent\\work/a1b2c3\\my-repo/src\\Helper.cs",
                [{ uriPath: "/c:/Users/user/my-repo" }]
            );
            expect(result).toEqual(["/c:/Users/user/my-repo/src/Helper.cs"]);
        });

        test("handles a UNC network path", () => {
            const result = computeSmartCandidatePathStrings(
                "\\\\build-server\\share\\my-repo\\src\\Helper.cs",
                [{ uriPath: "/c:/Users/user/my-repo" }]
            );
            expect(result).toEqual(["/c:/Users/user/my-repo/src/Helper.cs"]);
        });
    });
});
