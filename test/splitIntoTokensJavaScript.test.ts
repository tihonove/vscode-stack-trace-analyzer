const { splitIntoTokens } = require("../out/stackTraceSplitter");

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
            ["    "],
            ["at "],
            ["checkScreenshot", { type: "Symbol", symbols: ["checkScreenshot"] }],
            [" ("],
            [
                "../../../../Tests/BrowserTestsCore/ImageComparison/ImageComparer.ts:54:19",
                {
                    type: "FilePath",
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
            ["at "],
            [
                "Блокгрузпринял3Сотрудникинойуполномоченнойорганизации_7001201",
                {
                    symbols: ["Блокгрузпринял3Сотрудникинойуполномоченнойорганизации_7001201"],
                    type: "Symbol",
                },
            ],
            ["."],
            [
                "Фамилия формат",
                {
                    symbols: ["Блокгрузпринял3Сотрудникинойуполномоченнойорганизации_7001201", "Фамилия формат"],
                    type: "Symbol",
                },
            ],
            [" ("],
            [
                "forms\\70\\012\\7001201\\Candy\\test\\ui\\/Блок груз принял. 3. Сотрудник иной уполномоченной организации.test.ts:188:86",
                {
                    type: "FilePath",
                    filePath:
                        "forms/70/012/7001201/Candy/test/ui/Блок груз принял. 3. Сотрудник иной уполномоченной организации.test.ts",
                    line: 188,
                    column: 86,
                },
            ],
            [")"],
        ]);
    });

    test("Stack trace - 3", () => {
        const trace = `ModelNormalizer.ts:165 Uncaught Error: Unknown data source descriptors in data declaration. FieldName: allSingleSections. Value source: {"id":"diadoc","path":"SignViewModel","optional":false}
    at e.value (ModelNormalizer.ts:165:23)
    at e.value (ModelNormalizer.ts:125:18)
    at e.value (ModelNormalizer.ts:62:18)
    at e.value (ModelNormalizer.ts:92:22)
    at e.value (ModelNormalizer.ts:71:14)
    at e.value (ModelNormalizer.ts:57:14)
    at e.value (ModelNormalizer.ts:48:14)
    at e.<anonymous> (Form.ts:744:30)
    at c (runtime.js:63:40)
    at Generator._invoke (runtime.js:294:22)
    at Generator.next (runtime.js:119:21)
    at r (asyncToGenerator.js:3:20)
    at u (asyncToGenerator.js:25:9)
    at asyncToGenerator.js:32:7
    at new Promise (<anonymous>)
    at e.<anonymous> (asyncToGenerator.js:21:12)
    at e.<anonymous> (Form.ts:273:1)
    at e.<anonymous> (Form.ts:807:24)
    at c (runtime.js:63:40)
    at Generator._invoke (runtime.js:294:22)
    at Generator.next (runtime.js:119:21)
    at r (asyncToGenerator.js:3:20)
    at u (asyncToGenerator.js:25:9)
    at asyncToGenerator.js:32:7
    at new Promise (<anonymous>)
    at e.<anonymous> (asyncToGenerator.js:21:12)
    at e.<anonymous> (Form.ts:273:1)
    at InitForm.ts:37:20
    at c (runtime.js:63:40)
    at Generator._invoke (runtime.js:294:22)
    at Generator.next (runtime.js:119:21)
    at r (asyncToGenerator.js:3:20)
    at u (asyncToGenerator.js:25:9)`;

        var matches = splitIntoTokens(trace);
        expect(matches[2]).toEqual([
            ["    "],
            ["at "],
            [
                "e",
                {
                    type: "Symbol",
                    symbols: ["e"],
                },
            ],
            ["."],
            [
                "value",
                {
                    type: "Symbol",
                    symbols: ["e", "value"],
                },
            ],
            [" ("],
            [
                "ModelNormalizer.ts:125:18",
                {
                    type: "FilePath",
                    filePath: "ModelNormalizer.ts",
                    line: 125,
                    column: 18,
                },
            ],
            [")"],
        ]);
    });

    test("Stack trace - 4", () => {
        const trace = `Project with id 20479 not found
    at findPathToProjectById (webpack:[//test-analytics-front/./src/Domain/Storage.ts](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:68:9)
    at findPathToProjectById (webpack:[//test-analytics-front/./src/Domain/Storage.ts](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:59:22)
    at createLinkToProject (webpack:[//test-analytics-front/./src/Pages/Navigation.tsx](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:23:101)
    at eval (webpack:[//test-analytics-front/./src/Pages/JobsPage.tsx](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:88:75)
    at Array.map (<anonymous>)
    at JobsPage (webpack:[//test-analytics-front/./src/Pages/JobsPage.tsx](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:79:149)
    at renderWithHooks (webpack:[//test-analytics-front/./node_modules/react-dom/cjs/react-dom.development.js](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:15486:18)
    at mountIndeterminateComponent (webpack:[//test-analytics-front/./node_modules/react-dom/cjs/react-dom.development.js](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:20098:13)
    at beginWork (webpack:[//test-analytics-front/./node_modules/react-dom/cjs/react-dom.development.js](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:21621:16)
    at HTMLUnknownElement.callCallback (webpack:[//test-analytics-front/./node_modules/react-dom/cjs/react-dom.development.js](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:4164:14)`;

        var matches = splitIntoTokens(trace);
        expect(matches[1]).toEqual([
            ["    "],
            ["at "],
            [
                "findPathToProjectById",
                {
                    type: "Symbol",
                    symbols: ["findPathToProjectById"],
                },
            ],
            [" ("],
            [
                "webpack:[//test-analytics-front/./src/Domain/Storage.ts](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=32710623-caee-489a-98d8-867e11dab69a&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&purpose=webviewView#)?:68:9",
                {
                    type: "FilePath",
                    filePath: "/test-analytics-front/./src/Domain/Storage.ts",
                    line: 68,
                    column: 9,
                },
            ],
            [")"],
        ]);
    });

    test("Stack trace - 5", () => {
        const trace = `expected 1 to equal +0
AssertionError: expected 1 to equal +0
    at Блокгрузпринял4Уполномоченноефизическоелицо_7001201.Основания полномочий сотрудника формат (forms\\7001201\\test\\ui\\/Блок груз принял. 4. Уполномоченное физическое лицо.test.ts:144:86)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
------- Stdout: -------`;

        var matches = splitIntoTokens(trace);
        expect(matches[2]).toEqual([
            ["    "],
            ["at "],
            [
                "Блокгрузпринял4Уполномоченноефизическоелицо_7001201",
                {
                    type: "Symbol",
                    symbols: ["Блокгрузпринял4Уполномоченноефизическоелицо_7001201"],
                },
            ],
            ["."],
            [
                "Основания полномочий сотрудника формат",
                {
                    type: "Symbol",
                    symbols: [
                        "Блокгрузпринял4Уполномоченноефизическоелицо_7001201",
                        "Основания полномочий сотрудника формат",
                    ],
                },
            ],
            [" ("],
            [
                "forms\\7001201\\test\\ui\\/Блок груз принял. 4. Уполномоченное физическое лицо.test.ts:144:86",
                {
                    type: "FilePath",
                    filePath: "forms/7001201/test/ui/Блок груз принял. 4. Уполномоченное физическое лицо.test.ts",
                    line: 144,
                    column: 86,
                },
            ],
            [")"],
        ]);
    });

    test("Stack trace - 6", () => {
        const trace = `VM21249:1 Uncaught (in promise) SyntaxError: Failed to execute 'json' on 'Response': Unexpected end of JSON input
    at ServiceRunnerClient._callee3$ (ServiceRunnerClient.ts:113:31)
    at [tryCatch](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=593a67a8-748c-42fb-b3da-244cc0ac8c19&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&remoteAuthority=ssh-remote%2Bvm-rmtdev-04#) (ServiceRunnerClient.ts:7:1062)
    at [Generator](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=593a67a8-748c-42fb-b3da-244cc0ac8c19&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&remoteAuthority=ssh-remote%2Bvm-rmtdev-04#).[eval](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=593a67a8-748c-42fb-b3da-244cc0ac8c19&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&remoteAuthority=ssh-remote%2Bvm-rmtdev-04#) (ServiceRunnerClient.ts:7:3008)
    at Generator.eval [as next] (ServiceRunnerClient.ts:7:1699)
    at [asyncGeneratorStep](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=593a67a8-748c-42fb-b3da-244cc0ac8c19&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&remoteAuthority=ssh-remote%2Bvm-rmtdev-04#) (ServiceRunnerClient.ts:8:70)
    at [_next](vscode-webview://1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=593a67a8-748c-42fb-b3da-244cc0ac8c19&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&parentOrigin=vscode-file%3A%2F%2Fvscode-app&remoteAuthority=ssh-remote%2Bvm-rmtdev-04#) (ServiceRunnerClient.ts:9:163)`;

        var matches = splitIntoTokens(trace);
        expect(matches[2]).toEqual([
            ["    at [tryCatch](vscode-webview:"],
            [
                "//1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=593a67a8-748c-42fb-b3da-244cc0ac8c19&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net",
                {
                    type: "FilePath",
                    filePath:
                        "/1km1s56ci0alb2k3843rp088kufsg2c07oivp2d0j6bphfqg916c/index.html?id=593a67a8-748c-42fb-b3da-244cc0ac8c19&origin=0a6fc315-4f75-40fa-9f9f-a95af764cbc6&swVersion=4&extensionId=tihonove.stack-trace-analyzer&platform=electron&vscode-resource-base-authority=vscode-resource.vscode-cdn.net",
                },
            ],
            ["&parentOrigin=vscode-file%3A%2F%2Fvscode-app&remoteAuthority=ssh-remote%2Bvm-rmtdev-04#) ("],
            [
                "ServiceRunnerClient.ts:7:1062",
                {
                    type: "FilePath",
                    filePath: "ServiceRunnerClient.ts",
                    line: 7,
                    column: 1062,
                },
            ],
            [")"],
        ]);
    });

    test("Stack trace - 7", () => {
        const trace = `big.mjs:139 Uncaught (in promise) Error: [big.js] Invalid number
    at calculationFunctions.js:83:59
    at Object.resultHandler (AutocalcCommonFunctions.ts:58:24)
    at Calculator.executeHookFunctions (Calculator.ts:242:53)
    at Calculator.calculateHook (Calculator.ts:212:18)
    at Calculator.calculate (Calculator.ts:115:22)
    at ChangesProcessor.processCalculationsAsync (ChangesProcessor.ts:427:37)
    at ChangesProcessor.processEventsAfterUpdate (ChangesProcessor.ts:263:18)
    at Form.processEventsAfterUpdate (Form.ts:1168:32)
    at Form.performModelUpdate (Form.ts:1137:18)
    at Form.setViewModelField (Form.ts:547:18)
    at AllActionCreators.ts:75:14
    at crossFitTableMiddleware.ts:35:28
    at _callee2$ (InputContainer.tsx:80:13)
    at tryCatch (InputContainer.tsx:2:1)
    at Generator.<anonymous> (InputContainer.tsx:2:1)
    at Generator.next (InputContainer.tsx:2:1)
    at asyncGeneratorStep (InputContainer.tsx:2:1)
    at _next (InputContainer.tsx:2:1)
    at InputContainer.tsx:2:1
    at new Promise (<anonymous>)
    at InputContainer.tsx:2:1
    at onChangeWithHelper (InputContainer.tsx:84:10)
    at InputHelpers.ts:82:17
    at Object.handleChange [as onValueChange] (Input.tsx:174:17)
    at CurrencyInput.<anonymous> (CurrencyInput.tsx:347:32)`;

        var matches = splitIntoTokens(trace);
        expect(matches[2]).toEqual([
            ["    "],
            ["at "],
            [
                "Object",
                {
                    type: "Symbol",
                    symbols: ["Object"],
                },
            ],
            ["."],
            [
                "resultHandler",
                {
                    type: "Symbol",
                    symbols: ["Object", "resultHandler"],
                },
            ],
            [" ("],
            [
                "AutocalcCommonFunctions.ts:58:24",
                {
                    type: "FilePath",
                    filePath: "AutocalcCommonFunctions.ts",
                    line: 58,
                    column: 24,
                },
            ],
            [")"],
        ]);
        expect(matches[11]).toEqual([
            ["    at "],
            [
                "AllActionCreators.ts:75:14",
                {
                    type: "FilePath",
                    filePath: "AllActionCreators.ts",
                    line: 75,
                    column: 14,
                },
            ],
        ]);
    });

    test("Stack trace - 8", () => {
        const trace = `at O (webpack://test-analytics-front/./node_modules/styled-components/dist/styled-components.browser.esm.js?:32:23554)
    at PipelineRunTestListPage (webpack://test-analytics-front/./src/Pages/PipelineRunTestListPage.tsx?:39:126)
    at RenderedRoute (webpack://test-analytics-front/./node_modules/react-router/dist/index.js?:579:5)
    at RenderedRoute (webpack://test-analytics-front/./node_modules/react-router/dist/index.js?:579:5)
    at RenderedRoute (webpack://test-analytics-front/./node_modules/react-router/dist/index.js?:579:5)
    at Routes (webpack://test-analytics-front/./node_modules/react-router/dist/index.js?:1313:5)
    at div
    at O (webpack://test-analytics-front/./node_modules/styled-components/dist/styled-components.browser.esm.js?:32:23554)
    at App (webpack://test-analytics-front/./src/App.tsx?:43:121)
    at Suspense
    at Router (webpack://test-analytics-front/./node_modules/react-router/dist/index.js?:1247:15)
    at BrowserRouter (webpack://test-analytics-front/./node_modules/react-router-dom/dist/index.js?:704:5)
    at ot (webpack://test-analytics-front/./node_modules/styled-components/dist/styled-components.browser.esm.js?:32:20343)
    at TestAnalyticsThemeProvider (webpack://test-analytics-front/./src/Theme/TestAnalyticsThemeProvider.tsx?:19:114)        
        `;

        var matches = splitIntoTokens(trace);
        expect(matches[0]).toEqual([
            ["at "],
            [
                "O",
                {
                    type: "Symbol",
                    symbols: ["O"],
                },
            ],
            [" ("],
            ["webpack:"],
            [
                "//test-analytics-front/./node_modules/styled-components/dist/styled-components.browser.esm.js?:32:23554",
                {
                    type: "FilePath",
                    filePath:
                        "/test-analytics-front/./node_modules/styled-components/dist/styled-components.browser.esm.js",
                    line: 32,
                    column: 23554,
                },
            ],
            [")"],
        ]);
    });

    test("Stack trace - 9", () => {
        const trace = `src/Domain/Storage.ts(50,25): error TS18048: 'groupNode.projects' is possibly 'undefined'.
src/Domain/Storage.ts(57,29): error TS18048: 'groupNode.groups' is possibly 'undefined'.
src/Pages/MergeRequestJobsPage.tsx(57,22): error TS2741: Property 'indentLevel' is missing in type '{ rootProjectStructure: GroupNode; allJobs: [string, string][]; allJobRuns: JobsQueryRow[]; currentBranchName: string; }' but required in type 'JobsViewProps'.`;

        var matches = splitIntoTokens(trace);
        console.log(JSON.stringify(matches[1], null, 4));
        expect(matches[1]).toEqual([
            [
                "src/Domain/Storage.ts(57,29)",
                {
                    type: "FilePath",
                    filePath: "src/Domain/Storage.ts",
                    line: 57,
                    column: 29,
                },
            ],
            [": error TS18048: 'groupNode.groups' is possibly 'undefined'."],
        ]);
    });
});
