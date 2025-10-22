import { splitIntoTokens } from "../stackTraceSplitter";

describe("Go stack traces", () => {
    test("Basic Go panic", () => {
        const trace = `panic: runtime error: index out of range [3] with length 3

goroutine 1 [running]:
main.main()
    /tmp/sandbox879828148/prog.go:13 +0x20`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[3]).toEqual([
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["main"],
                },
            ],
            ["."],
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["main", "main"],
                },
            ],
            ["()"],
        ]);

        expect(matches[4]).toEqual([
            ["    "],
            [
                "/tmp/sandbox879828148/prog.go:13",
                {
                    type: "FilePath",
                    filePath: "/tmp/sandbox879828148/prog.go",
                    line: 13,
                },
            ],
            [" +0x20"],
        ]);
    });

    test("Go panic with multiple stack frames", () => {
        const trace = `panic: division by zero

goroutine 1 [running]:
main.divide(0x0, 0x5)
    /home/user/project/main.go:15 +0x39
main.calculate(...)
    /home/user/project/main.go:10
main.main()
    /home/user/project/main.go:5 +0x25`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[3]).toEqual([
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["main"],
                },
            ],
            ["."],
            [
                "divide",
                {
                    type: "Symbol",
                    symbols: ["main", "divide"],
                },
            ],
            ["(0x0, 0x5)"],
        ]);

        expect(matches[4]).toEqual([
            ["    "],
            [
                "/home/user/project/main.go:15",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/main.go",
                    line: 15,
                },
            ],
            [" +0x39"],
        ]);

        expect(matches[5]).toEqual([
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["main"],
                },
            ],
            ["."],
            [
                "calculate",
                {
                    type: "Symbol",
                    symbols: ["main", "calculate"],
                },
            ],
            ["(...)"],
        ]);

        expect(matches[6]).toEqual([
            ["    "],
            [
                "/home/user/project/main.go:10",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/main.go",
                    line: 10,
                },
            ],
        ]);
    });

    test("Go panic with package paths", () => {
        const trace = `panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x4a1f3e]

goroutine 1 [running]:
github.com/user/project/pkg/database.(*Connection).Query(0x0, 0xc000010230, 0x1e)
    /go/src/github.com/user/project/pkg/database/connection.go:45 +0x3e
github.com/user/project/internal/service.(*UserService).GetUser(0xc000086000, 0x1)
    /go/src/github.com/user/project/internal/service/user.go:28 +0x65
main.main()
    /go/src/github.com/user/project/cmd/server/main.go:15 +0x85`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[3]).toEqual([
            [
                "github",
                {
                    type: "Symbol",
                    symbols: ["github"],
                },
            ],
            ["."],
            [
                "com/user/project/pkg/database",
                {
                    type: "Symbol",
                    symbols: ["github", "com/user/project/pkg/database"],
                },
            ],
            [".(*Connection).Query(0x0, 0xc000010230, 0x1e)"],
        ]);

        expect(matches[4]).toEqual([
            ["    "],
            [
                "/go/src/github.com/user/project/pkg/database/connection.go:45",
                {
                    type: "FilePath",
                    filePath: "/go/src/github.com/user/project/pkg/database/connection.go",
                    line: 45,
                },
            ],
            [" +0x3e"],
        ]);

        expect(matches[5]).toEqual([
            [
                "github",
                {
                    type: "Symbol",
                    symbols: ["github"],
                },
            ],
            ["."],
            [
                "com/user/project/internal/service",
                {
                    type: "Symbol",
                    symbols: ["github", "com/user/project/internal/service"],
                },
            ],
            [".(*UserService).GetUser(0xc000086000, 0x1)"],
        ]);
    });

    test("Go panic with Windows paths", () => {
        const trace = `panic: runtime error: slice bounds out of range [5:3]

goroutine 1 [running]:
main.processData(...)
    C:/Users/developer/go/src/project/processor.go:23
main.main()
    C:/Users/developer/go/src/project/main.go:10 +0x4a`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[3]).toEqual([
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["main"],
                },
            ],
            ["."],
            [
                "processData",
                {
                    type: "Symbol",
                    symbols: ["main", "processData"],
                },
            ],
            ["(...)"],
        ]);

        expect(matches[4]).toEqual([
            ["    "],
            [
                "C:/Users/developer/go/src/project/processor.go:23",
                {
                    type: "FilePath",
                    filePath: "C:/Users/developer/go/src/project/processor.go",
                    line: 23,
                },
            ],
        ]);
    });

    test("Go panic with multiple goroutines", () => {
        const trace = `panic: send on closed channel

goroutine 7 [running]:
main.worker(0xc00001a0c0)
    /home/user/project/worker.go:34 +0x89
created by main.startWorkers
    /home/user/project/main.go:25 +0x5e

goroutine 1 [chan receive]:
main.main()
    /home/user/project/main.go:30 +0xa5`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[3]).toEqual([
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["main"],
                },
            ],
            ["."],
            [
                "worker",
                {
                    type: "Symbol",
                    symbols: ["main", "worker"],
                },
            ],
            ["(0xc00001a0c0)"],
        ]);

        expect(matches[4]).toEqual([
            ["    "],
            [
                "/home/user/project/worker.go:34",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/worker.go",
                    line: 34,
                },
            ],
            [" +0x89"],
        ]);

        expect(matches[5]).toEqual([
            ["created by "],
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["main"],
                },
            ],
            ["."],
            [
                "startWorkers",
                {
                    type: "Symbol",
                    symbols: ["main", "startWorkers"],
                },
            ],
        ]);

        expect(matches[6]).toEqual([
            ["    "],
            [
                "/home/user/project/main.go:25",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/main.go",
                    line: 25,
                },
            ],
            [" +0x5e"],
        ]);
    });

    test("Go panic with relative paths", () => {
        const trace = `panic: assignment to entry in nil map

goroutine 1 [running]:
main.addToMap(0x0, 0x4d8f60, 0x5, 0x10)
    ./internal/utils.go:18 +0x2a
main.main()
    ./cmd/app/main.go:8 +0x35`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[3]).toEqual([
            [
                "main",
                {
                    type: "Symbol",
                    symbols: ["main"],
                },
            ],
            ["."],
            [
                "addToMap",
                {
                    type: "Symbol",
                    symbols: ["main", "addToMap"],
                },
            ],
            ["(0x0, 0x4d8f60, 0x5, 0x10)"],
        ]);

        expect(matches[4]).toEqual([
            ["    "],
            [
                "./internal/utils.go:18",
                {
                    type: "FilePath",
                    filePath: "./internal/utils.go",
                    line: 18,
                },
            ],
            [" +0x2a"],
        ]);
    });
});
