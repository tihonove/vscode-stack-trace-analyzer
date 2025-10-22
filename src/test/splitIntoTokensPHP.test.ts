import { splitIntoTokens } from "../stackTraceSplitter";

describe("PHP stack traces", () => {
    test("Basic PHP fatal error", () => {
        const trace = `PHP Fatal error:  Uncaught exception 'Exception' with message 'The requested file does not exist.' in C:\\sites\\wonderfulproject\\script.php:40
Stack trace:
#0 {main}
  thrown in C:\\sites\\wonderfulproject\\script.php on line 40`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["PHP Fatal error:  Uncaught exception 'Exception' with message 'The requested file does not exist.' in "],
            [
                "C:\\sites\\wonderfulproject\\script.php:40",
                {
                    type: "FilePath",
                    filePath: "C:/sites/wonderfulproject/script.php",
                    line: 40,
                },
            ],
        ]);

        expect(matches[3]).toEqual([
            ["  thrown in "],
            [
                "C:\\sites\\wonderfulproject\\script.php",
                {
                    type: "FilePath",
                    filePath: "C:/sites/wonderfulproject/script.php",
                },
            ],
            [" on line 40"],
        ]);
    });

    test("PHP stack trace with numbered frames", () => {
        const trace = `PHP Fatal error: Uncaught Error: Call to undefined function myFunction() in /var/www/html/index.php:10
Stack trace:
#0 /var/www/html/lib/helper.php(25): mainController()
#1 /var/www/html/index.php(5): helperFunction()
#2 {main}
  thrown in /var/www/html/index.php on line 10`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["PHP Fatal error: Uncaught Error: Call to undefined function myFunction() in "],
            [
                "/var/www/html/index.php:10",
                {
                    type: "FilePath",
                    filePath: "/var/www/html/index.php",
                    line: 10,
                },
            ],
        ]);

        expect(matches[2]).toEqual([
            ["#0 "],
            [
                "/var/www/html/lib/helper.php(25)",
                {
                    type: "FilePath",
                    filePath: "/var/www/html/lib/helper.php",
                    line: 25,
                },
            ],
            [": mainController()"],
        ]);

        expect(matches[3]).toEqual([
            ["#1 "],
            [
                "/var/www/html/index.php(5)",
                {
                    type: "FilePath",
                    filePath: "/var/www/html/index.php",
                    line: 5,
                },
            ],
            [": helperFunction()"],
        ]);
    });

    test("PHP exception with class methods", () => {
        const trace = `Fatal error: Uncaught Exception: Database connection failed in /home/user/project/src/Database.php:45
Stack trace:
#0 /home/user/project/src/Database.php(30): Database->connect()
#1 /home/user/project/src/Controller.php(15): Database->query('SELECT * FROM users')
#2 /home/user/project/public/index.php(8): Controller->handleRequest()
#3 {main}
  thrown in /home/user/project/src/Database.php on line 45`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[2]).toEqual([
            ["#0 "],
            [
                "/home/user/project/src/Database.php(30)",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/src/Database.php",
                    line: 30,
                },
            ],
            [": Database->connect()"],
        ]);

        expect(matches[3]).toEqual([
            ["#1 "],
            [
                "/home/user/project/src/Controller.php(15)",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/src/Controller.php",
                    line: 15,
                },
            ],
            [": Database->query('SELECT * FROM users')"],
        ]);
    });

    test("PHP warning with file path", () => {
        const trace = `PHP Warning: Division by zero in /var/www/project/calculator.php on line 23
PHP Stack trace:
PHP   1. {main}() /var/www/project/calculator.php:0
PHP   2. calculate() /var/www/project/calculator.php:23`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["PHP Warning: Division by zero in "],
            [
                "/var/www/project/calculator.php",
                {
                    type: "FilePath",
                    filePath: "/var/www/project/calculator.php",
                },
            ],
            [" on line 23"],
        ]);

        expect(matches[2]).toEqual([
            ["PHP   1. {main}() "],
            [
                "/var/www/project/calculator.php:0",
                {
                    type: "FilePath",
                    filePath: "/var/www/project/calculator.php",
                    line: 0,
                },
            ],
        ]);

        expect(matches[3]).toEqual([
            ["PHP   2. calculate() "],
            [
                "/var/www/project/calculator.php:23",
                {
                    type: "FilePath",
                    filePath: "/var/www/project/calculator.php",
                    line: 23,
                },
            ],
        ]);
    });

    test("PHP 8 style stack trace", () => {
        const trace = `Fatal error: Uncaught TypeError: Cannot access offset of type string on string in /app/src/Parser.php:67
Stack trace:
#0 /app/src/Parser.php(45): Parser->parseData(Array)
#1 /app/src/Controller.php(30): Parser->process('input.txt')
#2 /app/public/index.php(12): Controller->run()
#3 {main}
  thrown in /app/src/Parser.php on line 67`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["Fatal error: Uncaught TypeError: Cannot access offset of type string on string in "],
            [
                "/app/src/Parser.php:67",
                {
                    type: "FilePath",
                    filePath: "/app/src/Parser.php",
                    line: 67,
                },
            ],
        ]);

        expect(matches[2]).toEqual([
            ["#0 "],
            [
                "/app/src/Parser.php(45)",
                {
                    type: "FilePath",
                    filePath: "/app/src/Parser.php",
                    line: 45,
                },
            ],
            [": Parser->parseData(Array)"],
        ]);
    });

    test("PHP relative paths", () => {
        const trace = `Fatal error: Uncaught Error in ./src/app.php:15
Stack trace:
#0 ./src/helper.php(8): doSomething()
#1 ./index.php(3): helperFunction()
#2 {main}
  thrown in ./src/app.php on line 15`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["Fatal error: Uncaught Error in "],
            [
                "./src/app.php:15",
                {
                    type: "FilePath",
                    filePath: "./src/app.php",
                    line: 15,
                },
            ],
        ]);

        expect(matches[2]).toEqual([
            ["#0 "],
            [
                "./src/helper.php(8)",
                {
                    type: "FilePath",
                    filePath: "./src/helper.php",
                    line: 8,
                },
            ],
            [": doSomething()"],
        ]);
    });

    test("PHP Windows paths with backslashes", () => {
        const trace = `PHP Fatal error:  Uncaught Exception in C:\\xampp\\htdocs\\project\\lib\\Database.php:42
Stack trace:
#0 C:\\xampp\\htdocs\\project\\controllers\\UserController.php(18): Database->connect()
#1 C:\\xampp\\htdocs\\project\\index.php(5): UserController->index()
#2 {main}
  thrown in C:\\xampp\\htdocs\\project\\lib\\Database.php on line 42`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["PHP Fatal error:  Uncaught Exception in "],
            [
                "C:\\xampp\\htdocs\\project\\lib\\Database.php:42",
                {
                    type: "FilePath",
                    filePath: "C:/xampp/htdocs/project/lib/Database.php",
                    line: 42,
                },
            ],
        ]);

        expect(matches[2]).toEqual([
            ["#0 "],
            [
                "C:\\xampp\\htdocs\\project\\controllers\\UserController.php(18)",
                {
                    type: "FilePath",
                    filePath: "C:/xampp/htdocs/project/controllers/UserController.php",
                    line: 18,
                },
            ],
            [": Database->connect()"],
        ]);
    });
});
