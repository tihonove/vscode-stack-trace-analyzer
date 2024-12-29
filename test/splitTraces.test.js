const { splitIntoTokens } = require("../src/stackTraceSplitter");
const { getPossibleFilePathsToSearch } = require("../src/stackTraceSplitter");

describe("C# stack traces", () => {
    test("Sample trace", () => {
        const trace = `
Kontur.FormsClassification.Exceptions.InvalidGFVException: Invalid GFV: 0. Идентификатор формы не может быть меньше 100101.
   at Kontur.FormsClassification.Tools.IdHelperCore.CheckFormatId(Int32 id) in /builds/forms/forms/forms.classification/Classification.Core/Tools/IdHelperCore.cs:line 52
   at Kontur.FormsClassification.Classification.GetFormat(Int32 gf) in /builds/forms/forms/forms.classification/Classification.Core/Classification.cs:line 46
   at Kontur.FormsClassification.Trash.ClassificationTrash.IsNdsDeclaration(Int32 gfv) in /builds/forms/forms/forms.classification/Classification.Core/Trash/ClassificationTrash.cs:line 470
   at Kontur.Forms.Api.Nds.Workers.DraftPreparer.SubWorkers.ProcessMakeFufResult.DoWorkAsync(DraftPrepareTask task, MakeFufWorkerResult makeFufResult, CancellationToken cancellationToken) in /builds/forms/forms/forms/Api.Nds/Workers/DraftPreparer/SubWorkers/ProcessMakeFufResult.cs:line 61
   at Kontur.Forms.Api.Nds.Controllers.DraftPrepareController.DoWorkAsync(DraftPrepareInput task, CancellationToken cancellationToken) in /builds/forms/forms/forms/Api.Nds/Controllers/DraftPrepareController.cs:line 36
   at Kontur.Forms.Core.Jobs.Controllers.ActionResults.ActionResultUnwrapper.UnwrapAsync(Type resultType, Object result) in /builds/forms/forms/forms.core.jobs/Core.Jobs/Controllers/ActionResults/ActionResultUnwrapper.cs:line 41
   at Kontur.Forms.Core.Jobs.Controllers.Actions.ControllerAction.ControllerActionInvoker.InvokeAsync(Object controllerInstance) in /builds/forms/forms/forms.core.jobs/Core.Jobs/Controllers/Actions/ControllerAction.cs:line 97
   at Kontur.Forms.Core.Jobs.Controllers.Invocation.JobControllerMainInvoker.InvokeAsync(IJobController jobController, JobInfo jobInfo, CancellationToken cancellationToken) in /builds/forms/forms/forms.core.jobs/Core.Jobs/Controllers/Invocation/JobControllerMainInvoker.cs:line 49
   at Kontur.Forms.Core.Jobs.Controllers.Routing.RoutedJobImplementation.InvokeMainInvokerAsync(JobInfo jobInfo, CancellationToken cancellationToken) in /builds/forms/forms/forms.core.jobs/Core.Jobs/Controllers/Routing/RoutedJobImplementation.cs:line 65
   at Kontur.Forms.Core.Jobs.Controllers.Routing.RoutedJobImplementation.ExecuteJobAsync(JobInfo jobInfo, CancellationToken cancellationToken) in /builds/forms/forms/forms.core.jobs/Core.Jobs/Controllers/Routing/RoutedJobImplementation.cs:line 57
        `;

        var matches = splitIntoTokens(trace);
        expect(matches[2]).toEqual([
            ["   at Kontur.FormsClassification.Tools.IdHelperCore.CheckFormatId(Int32 id) in "],
            [
                "/builds/forms/forms/forms.classification/Classification.Core/Tools/IdHelperCore.cs:line 52",
                {
                    type: "FullFilePathWithLine",
                    filePath: "/builds/forms/forms/forms.classification/Classification.Core/Tools/IdHelperCore.cs",
                    line: 52,
                },
            ],
        ]);
    });
});

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
});
