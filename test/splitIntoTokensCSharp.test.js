const { splitIntoTokens } = require("../src/stackTraceSplitter");

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

    test("Sample trace", () => {
        const trace = `
Kontur.FormsClassification.Exceptions.InvalidGFVException: Invalid GFV: 0. Идентификатор формы не может быть меньше 100101.
   at Kontur.FormsClassification.Tools.IdHelperCore.CheckFormatId(Int32 id) in \\/builds\\/forms\\/forms\\/forms.classification\\/Classification.Core\\/Tools\\/IdHelperCore.cs:line 52
   at Kontur.FormsClassification.Classification.GetFormat(Int32 gf) in \\/builds\\/forms\\/forms\\/forms.classification\\/Classification.Core\\/Classification.cs:line 46
   at Kontur.FormsClassification.Trash.ClassificationTrash.IsNdsDeclaration(Int32 gfv) in \\/builds\\/forms\\/forms\\/forms.classification\\/Classification.Core\\/Trash\\/ClassificationTrash.cs:line 470
   at Kontur.Forms.Api.Nds.Workers.DraftPreparer.SubWorkers.ProcessMakeFufResult.DoWorkAsync(DraftPrepareTask task, MakeFufWorkerResult makeFufResult, CancellationToken cancellationToken) in \\/builds\\/forms\\/forms\\/forms\\/Api.Nds\\/Workers\\/DraftPreparer\\/SubWorkers\\/ProcessMakeFufResult.cs:line 61
   at Kontur.Forms.Api.Nds.Controllers.DraftPrepareController.DoWorkAsync(DraftPrepareInput task, CancellationToken cancellationToken) in \\/builds\\/forms\\/forms\\/forms\\/Api.Nds\\/Controllers\\/DraftPrepareController.cs:line 36
   at Kontur.Forms.Core.Jobs.Controllers.ActionResults.ActionResultUnwrapper.UnwrapAsync(Type resultType, Object result) in \\/builds\\/forms\\/forms\\/forms.core.jobs\\/Core.Jobs\\/Controllers\\/ActionResults\\/ActionResultUnwrapper.cs:line 41
   at Kontur.Forms.Core.Jobs.Controllers.Actions.ControllerAction.ControllerActionInvoker.InvokeAsync(Object controllerInstance) in \\/builds\\/forms\\/forms\\/forms.core.jobs\\/Core.Jobs\\/Controllers\\/Actions\\/ControllerAction.cs:line 97
   at Kontur.Forms.Core.Jobs.Controllers.Invocation.JobControllerMainInvoker.InvokeAsync(IJobController jobController, JobInfo jobInfo, CancellationToken cancellationToken) in \\/builds\\/forms\\/forms\\/forms.core.jobs\\/Core.Jobs\\/Controllers\\/Invocation\\/JobControllerMainInvoker.cs:line 49
   at Kontur.Forms.Core.Jobs.Controllers.Routing.RoutedJobImplementation.InvokeMainInvokerAsync(JobInfo jobInfo, CancellationToken cancellationToken) in \\/builds\\/forms\\/forms\\/forms.core.jobs\\/Core.Jobs\\/Controllers\\/Routing\\/RoutedJobImplementation.cs:line 65
   at Kontur.Forms.Core.Jobs.Controllers.Routing.RoutedJobImplementation.ExecuteJobAsync(JobInfo jobInfo, CancellationToken cancellationToken) in \\/builds\\/forms\\/forms\\/forms.core.jobs\\/Core.Jobs\\/Controllers\\/Routing\\/RoutedJobImplementation.cs:line 57
        `;

        var matches = splitIntoTokens(trace);
        expect(matches[2]).toEqual([
            ["   at Kontur.FormsClassification.Tools.IdHelperCore.CheckFormatId(Int32 id) in "],
            [
                "\\/builds\\/forms\\/forms\\/forms.classification\\/Classification.Core\\/Tools\\/IdHelperCore.cs:line 52",
                {
                    type: "FullFilePathWithLine",
                    filePath: "/builds/forms/forms/forms.classification/Classification.Core/Tools/IdHelperCore.cs",
                    line: 52,
                },
            ],
        ]);
    });

    test("Winfows paths", () => {
        const trace = `
DiadocSys.Core.Exceptions.DomainException: ErrorCode: ClientError (Http.BadRequest), SystemMessage: {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"offset":["Value must be more than or equal to 0"]},"traceId":"00-586e78054c1252e9237b0964a19b8e5f-559cfd46d4c4dbf5-01"}, ApiClientMessage: , UserMessage: {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"errors":{"offset":["Value must be more than or equal to 0"]},"traceId":"00-586e78054c1252e9237b0964a19b8e5f-559cfd46d4c4dbf5-01"}, IgnoreDisabling: False
    at Diadoc.Hosting.Commons.ClusterClient.ClusterClientResultHandler.ProcessResponseStatusCode(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Common\\Diadoc.Hosting.Commons\\ClusterClient\\ClusterClientResultHandler.cs:97:5)
    at Diadoc.Hosting.Commons.ClusterClient.ClusterClientResultHandler.HandleClusterResult(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Common\\Diadoc.Hosting.Commons\\ClusterClient\\ClusterClientResultHandler.cs:24:6)
    at Diadoc.Hosting.Commons.ClusterClient.ClusterClientExtensions+<GetResponseAsync>d__4\`1.MoveNext(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Common\\Diadoc.Hosting.Commons\\ClusterClient\\ClusterClientExtensions.cs:74:4)
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Diadoc.PublicApi.Implementation.Boxes.PublicApi.Services.Employees.ApiEmployeesService+<GetAllPagedAsync>d__6.MoveNext(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Services.Boxes\\Diadoc.PublicApi.Implementation.Boxes\\PublicApi\\Services\\Employees\\ApiEmployeesService.cs:88:4)
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at lambda_method~()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ActionMethodExecutor+AwaitableObjectResultExecutor+<Execute>d__0.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker+<<InvokeActionMethodAsync>g__Awaited|12_0>d.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker+<<InvokeNextActionFilterAsync>g__Awaited|10_0>d.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker.Rethrow()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker.Next()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ControllerActionInvoker+<<InvokeInnerFilterAsync>g__Awaited|13_0>d.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ResourceInvoker+<<InvokeNextResourceFilter>g__Awaited|25_0>d.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ResourceInvoker.Rethrow()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ResourceInvoker.Next()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ResourceInvoker+<<InvokeFilterPipelineAsync>g__Awaited|20_0>d.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ResourceInvoker+<<InvokeAsync>g__Awaited|17_0>d.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at Microsoft.AspNetCore.Mvc.Infrastructure.ResourceInvoker+<<InvokeAsync>g__Awaited|17_0>d.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Diadoc.PublicApiApp.Implementations.PublicApi.Middlewares.UpdateUserWhiteLabelMiddleware+<InvokeAsync>d__3.MoveNext(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Services.Common\\Diadoc.PublicApiApp\\Implementations\\PublicApi\\Middlewares\\UpdateUserWhiteLabelMiddleware.cs:22:3)
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Microsoft.AspNetCore.Authorization.AuthorizationMiddleware+<Invoke>d__11.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Microsoft.AspNetCore.Authentication.AuthenticationMiddleware+<Invoke>d__6.MoveNext()
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Diadoc.PublicApiApp.Implementations.PublicApi.Middlewares.SetDiadocTeamMiddleware+<InvokeAsync>d__2.MoveNext(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Services.Common\\Diadoc.PublicApiApp\\Implementations\\PublicApi\\Middlewares\\SetDiadocTeamMiddleware.cs:26:3)
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Diadoc.PublicApiApp.Implementations.PublicApi.Middlewares.NotSupportedResponseMiddleware+<InvokeAsync>d__2.MoveNext(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Services.Common\\Diadoc.PublicApiApp\\Implementations\\PublicApi\\Middlewares\\NotSupportedResponseMiddleware.cs:34:4)
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Diadoc.PublicApiApp.Implementations.PublicApi.Middlewares.SunsetMiddleware+<InvokeAsync>d__4.MoveNext(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Services.Common\\Diadoc.PublicApiApp\\Implementations\\PublicApi\\Middlewares\\SunsetMiddleware.cs:34:4)
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Diadoc.Experimental.Analytics.Middlewares.AspNetCoreAnalyticMiddleware\`1+<InvokeAsync>d__9.MoveNext(C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Common\\Diadoc.Experimental.Analytics\\Middlewares\\AspNetCoreAnalyticMiddleware.cs:70:4)
    at System.Runtime.ExceptionServices.ExceptionDispatchInfo.Throw()
    at System.Runtime.CompilerServices.TaskAwaiter.HandleNonSuccessAndDebuggerNotification()
    at Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddlewareImpl+<<Invoke>g__Awaited|10_0>d.MoveNext()
            `;

        var matches = splitIntoTokens(trace);
        expect(matches[7]).toEqual([
            ["    at Diadoc.PublicApi.Implementation.Boxes.PublicApi.Services.Employees.ApiEmployeesService+<GetAllPagedAsync>d__6.MoveNext("],
            [
                "C:\\BuildAgent\\work\\124ea67cdf592b6d\\_Src\\Services.Boxes\\Diadoc.PublicApi.Implementation.Boxes\\PublicApi\\Services\\Employees\\ApiEmployeesService.cs:88:4",
                {
                    type: "FullFilePathWithLine",
                    filePath: "C:/BuildAgent/work/124ea67cdf592b6d/_Src/Services.Boxes/Diadoc.PublicApi.Implementation.Boxes/PublicApi/Services/Employees/ApiEmployeesService.cs",
                    line: 88,
                    column: 4,
                },
            ],
            [")"]
        ]);
    });
});
