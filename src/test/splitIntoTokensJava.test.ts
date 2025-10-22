import { splitIntoTokens } from "../stackTraceSplitter";

describe("Java stack traces", () => {
    test("Basic Java NullPointerException", () => {
        const trace = `Exception in thread "main" java.lang.NullPointerException
    at NullPointerExceptionExample.printLength(NullPointerExceptionExample.java:3)
    at NullPointerExceptionExample.main(NullPointerExceptionExample.java:8)`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["    "],
            ["at "],
            [
                "NullPointerExceptionExample",
                {
                    type: "Symbol",
                    symbols: ["NullPointerExceptionExample"],
                },
            ],
            ["."],
            [
                "printLength",
                {
                    type: "Symbol",
                    symbols: ["NullPointerExceptionExample", "printLength"],
                },
            ],
            ["("],
            [
                "NullPointerExceptionExample.java:3",
                {
                    type: "FilePath",
                    filePath: "NullPointerExceptionExample.java",
                    line: 3,
                },
            ],
            [")"],
        ]);

        expect(matches[2]).toEqual([
            ["    "],
            ["at "],
            [
                "NullPointerExceptionExample",
                {
                    type: "Symbol",
                    symbols: ["NullPointerExceptionExample"],
                },
            ],
            ["."],
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["NullPointerExceptionExample", "main"],
                },
            ],
            ["("],
            [
                "NullPointerExceptionExample.java:8",
                {
                    type: "FilePath",
                    filePath: "NullPointerExceptionExample.java",
                    line: 8,
                },
            ],
            [")"],
        ]);
    });

    test("Java stack trace with package names", () => {
        const trace = `java.lang.RuntimeException: Failed to process request
    at com.example.service.DataProcessor.process(DataProcessor.java:45)
    at com.example.service.RequestHandler.handleRequest(RequestHandler.java:123)
    at com.example.web.Controller.doPost(Controller.java:87)
    at javax.servlet.http.HttpServlet.service(HttpServlet.java:661)`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["    "],
            ["at "],
            [
                "com",
                {
                    type: "Symbol",
                    symbols: ["com"],
                },
            ],
            ["."],
            [
                "example",
                {
                    type: "Symbol",
                    symbols: ["com", "example"],
                },
            ],
            ["."],
            [
                "service",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "service"],
                },
            ],
            ["."],
            [
                "DataProcessor",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "service", "DataProcessor"],
                },
            ],
            ["."],
            [
                "process",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "service", "DataProcessor", "process"],
                },
            ],
            ["("],
            [
                "DataProcessor.java:45",
                {
                    type: "FilePath",
                    filePath: "DataProcessor.java",
                    line: 45,
                },
            ],
            [")"],
        ]);
    });

    test("Java stack trace with absolute paths", () => {
        const trace = `Exception in thread "main" java.io.FileNotFoundException: /tmp/data/input.txt (No such file or directory)
    at java.io.FileInputStream.open0(Native Method)
    at java.io.FileInputStream.open(FileInputStream.java:195)
    at com.myapp.FileReader.readFile(/home/user/project/src/com/myapp/FileReader.java:42)
    at com.myapp.Main.main(/home/user/project/src/com/myapp/Main.java:15)`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[3]).toEqual([
            ["    "],
            ["at "],
            [
                "com",
                {
                    type: "Symbol",
                    symbols: ["com"],
                },
            ],
            ["."],
            [
                "myapp",
                {
                    type: "Symbol",
                    symbols: ["com", "myapp"],
                },
            ],
            ["."],
            [
                "FileReader",
                {
                    type: "Symbol",
                    symbols: ["com", "myapp", "FileReader"],
                },
            ],
            ["."],
            [
                "readFile",
                {
                    type: "Symbol",
                    symbols: ["com", "myapp", "FileReader", "readFile"],
                },
            ],
            ["("],
            [
                "/home/user/project/src/com/myapp/FileReader.java:42",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/src/com/myapp/FileReader.java",
                    line: 42,
                },
            ],
            [")"],
        ]);
    });

    test("Java stack trace with Unknown Source", () => {
        const trace = `java.lang.IllegalArgumentException: Invalid parameter
    at com.example.Utils.validateInput(Unknown Source)
    at com.example.Service.process(Service.java:78)
    at com.example.Main.main(Main.java:12)`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[2]).toEqual([
            ["    "],
            ["at "],
            [
                "com",
                {
                    type: "Symbol",
                    symbols: ["com"],
                },
            ],
            ["."],
            [
                "example",
                {
                    type: "Symbol",
                    symbols: ["com", "example"],
                },
            ],
            ["."],
            [
                "Service",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "Service"],
                },
            ],
            ["."],
            [
                "process",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "Service", "process"],
                },
            ],
            ["("],
            [
                "Service.java:78",
                {
                    type: "FilePath",
                    filePath: "Service.java",
                    line: 78,
                },
            ],
            [")"],
        ]);
    });

    test("Java stack trace with Caused by", () => {
        const trace = `java.lang.RuntimeException: Wrapper exception
    at com.example.App.run(App.java:25)
    at com.example.Main.main(Main.java:10)
Caused by: java.sql.SQLException: Connection failed
    at com.example.db.ConnectionManager.getConnection(ConnectionManager.java:67)
    at com.example.App.run(App.java:20)`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["    "],
            ["at "],
            [
                "com",
                {
                    type: "Symbol",
                    symbols: ["com"],
                },
            ],
            ["."],
            [
                "example",
                {
                    type: "Symbol",
                    symbols: ["com", "example"],
                },
            ],
            ["."],
            [
                "App",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "App"],
                },
            ],
            ["."],
            [
                "run",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "App", "run"],
                },
            ],
            ["("],
            [
                "App.java:25",
                {
                    type: "FilePath",
                    filePath: "App.java",
                    line: 25,
                },
            ],
            [")"],
        ]);

        expect(matches[4]).toEqual([
            ["    "],
            ["at "],
            [
                "com",
                {
                    type: "Symbol",
                    symbols: ["com"],
                },
            ],
            ["."],
            [
                "example",
                {
                    type: "Symbol",
                    symbols: ["com", "example"],
                },
            ],
            ["."],
            [
                "db",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "db"],
                },
            ],
            ["."],
            [
                "ConnectionManager",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "db", "ConnectionManager"],
                },
            ],
            ["."],
            [
                "getConnection",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "db", "ConnectionManager", "getConnection"],
                },
            ],
            ["("],
            [
                "ConnectionManager.java:67",
                {
                    type: "FilePath",
                    filePath: "ConnectionManager.java",
                    line: 67,
                },
            ],
            [")"],
        ]);
    });

    test("Java stack trace with Windows paths", () => {
        const trace = `Exception in thread "main" java.lang.ArithmeticException: / by zero
    at com.example.Calculator.divide(C:\\Projects\\MyApp\\src\\com\\example\\Calculator.java:15)
    at com.example.Main.main(C:\\Projects\\MyApp\\src\\com\\example\\Main.java:8)`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["    "],
            ["at "],
            [
                "com",
                {
                    type: "Symbol",
                    symbols: ["com"],
                },
            ],
            ["."],
            [
                "example",
                {
                    type: "Symbol",
                    symbols: ["com", "example"],
                },
            ],
            ["."],
            [
                "Calculator",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "Calculator"],
                },
            ],
            ["."],
            [
                "divide",
                {
                    type: "Symbol",
                    symbols: ["com", "example", "Calculator", "divide"],
                },
            ],
            ["("],
            [
                "C:\\Projects\\MyApp\\src\\com\\example\\Calculator.java:15",
                {
                    type: "FilePath",
                    filePath: "C:/Projects/MyApp/src/com/example/Calculator.java",
                    line: 15,
                },
            ],
            [")"],
        ]);
    });
});
