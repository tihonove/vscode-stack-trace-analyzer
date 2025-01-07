const { splitIntoTokens } = require("../src/stackTraceSplitter");

describe("Javascript stack traces", () => {
    test("Sample trace", () => {
        const trace = `
Expected image to match or be a close match to snapshot but was 0.04742625795257374% different from snapshot (861 differing pixels).
See diff for details: C:\\BuildAgent\\work\\forms-root-all\\diadoc.forms\\candy.diadoc.farm\\forms\\7002101\\test\\screenshot\\snapshots\\Page7002101ScreenShotTest\\chrome\\__diff_output__\\Представитель грузополучателя - заполнен-1-diff.png
Error: Expected image to match or be a close match to snapshot but was 0.04742625795257374% different from snapshot (861 differing pixels).
See diff for details: C:\\BuildAgent\\work\\forms-root-all\\diadoc.forms\\candy.diadoc.farm\\forms\\7002101\\test\\screenshot\\snapshots\\Page7002101ScreenShotTest\\chrome\\__diff_output__\\Представитель грузополучателя - заполнен-1-diff.png
    at checkScreenshot (../../../../Tests/BrowserTestsCore/ImageComparison/ImageComparer.ts:54:19)
    at CaptureScreenshotsTestContext.checkScreenshot (../../../../Tests/BrowserTestsCore/TextContexts/CaptureScreenshotsTestContext.ts:130:28)
    at Page7002101ScreenShotTest.checkScreenshot (../../../../Tests/CandyFarmTests/ScreenshotTests/CandyFarmScreenshotTestBase.ts:72:9)
    at Page7002101ScreenShotTest.Представитель грузополучателя: заполнен (forms\\7002101\\test\\screenshot\\/Page7002101ScreenShotTest.test.ts:24:9)
    at Context.enhancedFn (../../../../Tests/BrowserTestsCore/TextContexts/MochaHacks.ts:19:17)
------- Stdout: -------
        `;

        var matches = splitIntoTokens(trace);
        expect(matches[5]).toEqual([
            ["    at checkScreenshot ("],
            [
                "../../../../Tests/BrowserTestsCore/ImageComparison/ImageComparer.ts:54:19",
                {
                    type: "FullFilePathWithLine",
                    filePath: "../../../../Tests/BrowserTestsCore/ImageComparison/ImageComparer.ts",
                    line: 54,
                    column: 19,
                },
            ],
            [")"],
        ]);
    });

    test("Mixed path separators", () => {
        const trace = `
expected +0 to equal 1

AssertionError: expected +0 to equal 1

at Блокгрузпринял3Сотрудникинойуполномоченнойорганизации_7001201.Фамилия формат (forms\\70\\012\\7001201\\Candy\\test\\ui\\\/Блок груз принял. 3. Сотрудник иной уполномоченной организации.test.ts:188:86)

at processTicksAndRejections (node:internal/process/task_queues:95:5)        `;

        var matches = splitIntoTokens(trace);
        expect(matches[5]).toEqual([
            ["at Блокгрузпринял3Сотрудникинойуполномоченнойорганизации_7001201.Фамилия формат ("],
            [
                "forms\\70\\012\\7001201\\Candy\\test\\ui\\/Блок груз принял. 3. Сотрудник иной уполномоченной организации.test.ts:188:86",
                {
                    type: "FullFilePathWithLine",
                    filePath: "forms/70/012/7001201/Candy/test/ui/Блок груз принял. 3. Сотрудник иной уполномоченной организации.test.ts",
                    line: 188,
                    column: 86,
                },
            ],
            [")"],
        ]);
    });
});
