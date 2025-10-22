import { splitIntoTokens } from "../stackTraceSplitter";

describe("Python stack traces", () => {
    test("Basic Python traceback", () => {
        const trace = `Traceback (most recent call last):
  File "/path/to/example.py", line 4, in <module>
    greet('Chad')
  File "/path/to/example.py", line 2, in greet
    print('Hello, ' + someon)
NameError: name 'someon' is not defined`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["  File \""],
            [
                "/path/to/example.py",
                {
                    type: "FilePath",
                    filePath: "/path/to/example.py",
                },
            ],
            ["\", line 4, in <module>"],
        ]);

        expect(matches[3]).toEqual([
            ["  File \""],
            [
                "/path/to/example.py",
                {
                    type: "FilePath",
                    filePath: "/path/to/example.py",
                },
            ],
            ["\", line 2, in greet"],
        ]);
    });

    test("Python traceback with line numbers", () => {
        const trace = `Traceback (most recent call last):
  File "/home/user/project/src/main.py", line 42, in main
    result = divide(10, 0)
  File "/home/user/project/src/utils.py", line 15, in divide
    return a / b
ZeroDivisionError: division by zero`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["  File \""],
            [
                "/home/user/project/src/main.py",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/src/main.py",
                },
            ],
            ["\", line 42, in main"],
        ]);

        expect(matches[3]).toEqual([
            ["  File \""],
            [
                "/home/user/project/src/utils.py",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/src/utils.py",
                },
            ],
            ["\", line 15, in divide"],
        ]);
    });

    test("Python traceback with Windows paths", () => {
        const trace = `Traceback (most recent call last):
  File "C:\\Users\\developer\\project\\app.py", line 10, in <module>
    run_application()
  File "C:\\Users\\developer\\project\\core\\engine.py", line 25, in run_application
    engine.start()
RuntimeError: Engine failed to start`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["  File \""],
            [
                "C:\\Users\\developer\\project\\app.py",
                {
                    type: "FilePath",
                    filePath: "C:/Users/developer/project/app.py",
                },
            ],
            ["\", line 10, in <module>"],
        ]);

        expect(matches[3]).toEqual([
            ["  File \""],
            [
                "C:\\Users\\developer\\project\\core\\engine.py",
                {
                    type: "FilePath",
                    filePath: "C:/Users/developer/project/core/engine.py",
                },
            ],
            ["\", line 25, in run_application"],
        ]);
    });

    test("Python traceback with relative paths", () => {
        const trace = `Traceback (most recent call last):
  File "./src/main.py", line 100, in process_data
    data = parser.parse(input_file)
  File "./src/parser.py", line 55, in parse
    return self._parse_internal(file)
  File "./src/parser.py", line 78, in _parse_internal
    raise ValueError("Invalid format")
ValueError: Invalid format`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["  File \"."],
            [
                "/src/main.py",
                {
                    type: "FilePath",
                    filePath: "/src/main.py",
                },
            ],
            ["\", line 100, in process_data"],
        ]);
    });

    test("Python traceback with module paths", () => {
        const trace = `Traceback (most recent call last):
  File "/usr/lib/python3.9/site-packages/django/core/handlers/base.py", line 47, in inner
    response = get_response(request)
  File "/home/user/myproject/myapp/views.py", line 123, in my_view
    obj = MyModel.objects.get(pk=invalid_id)
  File "/usr/lib/python3.9/site-packages/django/db/models/manager.py", line 85, in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
DoesNotExist: MyModel matching query does not exist.`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["  File \""],
            [
                "/usr/lib/python3.9/site-packages/django/core/handlers/base.py",
                {
                    type: "FilePath",
                    filePath: "/usr/lib/python3.9/site-packages/django/core/handlers/base.py",
                },
            ],
            ["\", line 47, in inner"],
        ]);

        expect(matches[3]).toEqual([
            ["  File \""],
            [
                "/home/user/myproject/myapp/views.py",
                {
                    type: "FilePath",
                    filePath: "/home/user/myproject/myapp/views.py",
                },
            ],
            ["\", line 123, in my_view"],
        ]);
    });
});
