const { getPossibleFilePathsToSearch } = require("../src/stackTraceSplitter");

describe("File path utils", () => {
    test("should generate all possible file paths to search", () => {
        const filePath = "a/b/c/d/file.js";
        const expectedPaths = ["a/b/c/d/file.js", "b/c/d/file.js", "c/d/file.js", "d/file.js", "file.js"];

        const result = Array.from(getPossibleFilePathsToSearch(filePath));
        expect(result).toEqual(expectedPaths);
    });

    test("should handle root file path correctly", () => {
        const filePath = "file.js";
        const expectedPaths = ["file.js"];

        const result = Array.from(getPossibleFilePathsToSearch(filePath));
        expect(result).toEqual(expectedPaths);
    });

    test("should handle empty file path correctly", () => {
        const filePath = "";
        const expectedPaths = [""];

        const result = Array.from(getPossibleFilePathsToSearch(filePath));
        expect(result).toEqual(expectedPaths);
    });

    test("should handle single directory file path correctly", () => {
        const filePath = "dir/file.js";
        const expectedPaths = ["dir/file.js", "file.js"];

        const result = Array.from(getPossibleFilePathsToSearch(filePath));
        expect(result).toEqual(expectedPaths);
    });

    test("should handle file path with backslashes correctly", () => {
        const filePath = "a\\b\\c\\d\\file.js";
        const expectedPaths = ["a/b/c/d/file.js", "b/c/d/file.js", "c/d/file.js", "d/file.js", "file.js"];

        const result = Array.from(getPossibleFilePathsToSearch(filePath));
        expect(result).toEqual(expectedPaths);
    });

    test("should handle root file path with backslashes correctly", () => {
        const filePath = "file.js";
        const expectedPaths = ["file.js"];

        const result = Array.from(getPossibleFilePathsToSearch(filePath));
        expect(result).toEqual(expectedPaths);
    });

    test("should handle empty file path with backslashes correctly", () => {
        const filePath = "";
        const expectedPaths = [""];

        const result = Array.from(getPossibleFilePathsToSearch(filePath));
        expect(result).toEqual(expectedPaths);
    });

    test("should handle single directory file path with backslashes correctly", () => {
        const filePath = "dir\\file.js";
        const expectedPaths = ["dir/file.js", "file.js"];

        const result = Array.from(getPossibleFilePathsToSearch(filePath));
        expect(result).toEqual(expectedPaths);
    });
});
