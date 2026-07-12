import * as path from "node:path";
import { basenameLower, computeSmartCandidatePathsPure, matchCandidate, trailingMatchLength } from "../native/pathMatch";

describe("basenameLower", () => {
    test("lowercases and handles both separators", () => {
        expect(basenameLower("src/Utils/Helper.cs")).toBe("helper.cs");
        expect(basenameLower("src\\Utils\\Helper.cs")).toBe("helper.cs");
        expect(basenameLower("Helper.cs")).toBe("helper.cs");
    });
});

describe("computeSmartCandidatePathsPure", () => {
    test("builds absolute path when a root name matches a path segment", () => {
        expect(computeSmartCandidatePathsPure("/ci/build/my-repo/src/Utils/Helper.cs", ["/home/user/my-repo"])).toEqual([
            path.join("/home/user/my-repo", "src", "Utils", "Helper.cs"),
        ]);
    });

    test("is case-insensitive and normalizes backslashes", () => {
        expect(
            computeSmartCandidatePathsPure("C:\\BuildAgent\\work\\hash\\My-Repo\\src\\Utils\\Helper.cs", ["/home/user/my-repo"])
        ).toEqual([path.join("/home/user/my-repo", "src", "Utils", "Helper.cs")]);
    });

    test("returns empty when no root name is found", () => {
        expect(computeSmartCandidatePathsPure("/ci/build/my-repo/src/Helper.cs", ["/home/user/other"])).toEqual([]);
    });

    test("does not match when the root name is only the last segment", () => {
        expect(computeSmartCandidatePathsPure("/ci/build/my-repo", ["/home/user/my-repo"])).toEqual([]);
    });

    test("handles a root name appearing multiple times", () => {
        expect(computeSmartCandidatePathsPure("/ci/foo/foo/foo/src/Helper.cs", ["/home/user/foo"])).toEqual([
            path.join("/home/user/foo", "foo", "foo", "src", "Helper.cs"),
            path.join("/home/user/foo", "foo", "src", "Helper.cs"),
            path.join("/home/user/foo", "src", "Helper.cs"),
        ]);
    });
});

describe("trailingMatchLength", () => {
    test("counts shared trailing segments, case-insensitive, mixed separators", () => {
        expect(trailingMatchLength("Utils/Helper.cs", "src/utils/helper.cs")).toBe(2);
        expect(trailingMatchLength("Utils/Helper.cs", "src\\Utils\\Helper.cs")).toBe(2);
        expect(trailingMatchLength("a/b/File.ts", "x/File.ts")).toBe(1);
        expect(trailingMatchLength("Helper.cs", "src/Other.cs")).toBe(0);
    });
});

describe("matchCandidate", () => {
    test("prefers the longest matching suffix (disambiguation)", () => {
        const best = matchCandidate("Utils/Helper.cs", ["tests/Helper.cs", "src/Utils/Helper.cs"]);
        expect(best).toBe("src/Utils/Helper.cs");
    });

    test("ignores candidates that do not share the basename", () => {
        expect(matchCandidate("Helper.cs", ["src/FooHelper.cs", "src/Other.cs"])).toBeUndefined();
    });

    test("tie-breaks to the shorter path, then lexicographically", () => {
        expect(matchCandidate("Helper.cs", ["z/Helper.cs", "a/Helper.cs"])).toBe("a/Helper.cs");
        expect(matchCandidate("Helper.cs", ["deep/dir/Helper.cs", "x/Helper.cs"])).toBe("x/Helper.cs");
    });

    test("returns undefined for no candidates", () => {
        expect(matchCandidate("Helper.cs", [])).toBeUndefined();
    });
});
