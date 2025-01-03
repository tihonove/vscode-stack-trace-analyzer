const { levenshteinDistance } = require("../src/levenshteinDistance");

describe("levenshteinDistance", () => {
    test("returns 0 for identical strings", () => {
        expect(levenshteinDistance("kitten", "kitten")).toBe(0);
    });

    test("returns the length of the other string when one is empty", () => {
        expect(levenshteinDistance("", "kitten")).toBe(6);
        expect(levenshteinDistance("kitten", "")).toBe(6);
    });

    test("calculates the distance correctly for different strings", () => {
        expect(levenshteinDistance("kitten", "sitting")).toBe(3);
        expect(levenshteinDistance("flaw", "lawn")).toBe(2);
        expect(levenshteinDistance("gumbo", "gambol")).toBe(2);
    });

    test("returns the correct distance for single character strings", () => {
        expect(levenshteinDistance("a", "b")).toBe(1);
        expect(levenshteinDistance("a", "a")).toBe(0);
    });

    test("returns the correct distance for strings with different lengths", () => {
        expect(levenshteinDistance("abc", "yabd")).toBe(2);
        expect(levenshteinDistance("abcdef", "azced")).toBe(3);
    });
});
