import { splitIntoTokens } from "../stackTraceSplitter";

describe("Ruby stack traces", () => {
    test("Basic Ruby backtrace", () => {
        const trace = `maths_is_hard.rb:2:in \`/': divided by 0 (ZeroDivisionError)
    from maths_is_hard.rb:2:in \`divide'
    from maths_is_hard.rb:5:in \`<main>'`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            [
                "maths_is_hard.rb:2",
                {
                    type: "FilePath",
                    filePath: "maths_is_hard.rb",
                    line: 2,
                },
            ],
            [":in `/': divided by 0 (ZeroDivisionError)"],
        ]);

        expect(matches[1]).toEqual([
            [
                "    from maths_is_hard.rb:2",
                {
                    type: "FilePath",
                    filePath: "    from maths_is_hard.rb",
                    line: 2,
                },
            ],
            [":in `divide'"],
        ]);

        expect(matches[2]).toEqual([
            [
                "    from maths_is_hard.rb:5",
                {
                    type: "FilePath",
                    filePath: "    from maths_is_hard.rb",
                    line: 5,
                },
            ],
            [":in `<main>'"],
        ]);
    });

    test("Ruby backtrace with absolute paths", () => {
        const trace = `/home/user/project/app.rb:42:in \`process': undefined method \`foo' for nil:NilClass (NoMethodError)
    from /home/user/project/controller.rb:18:in \`handle_request'
    from /home/user/project/main.rb:10:in \`<main>'`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            [
                "/home/user/project/app.rb:42",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/app.rb",
                    line: 42,
                },
            ],
            [":in `process': undefined method `foo' for nil:NilClass (NoMethodError)"],
        ]);

        expect(matches[1]).toEqual([
            ["    from "],
            [
                "/home/user/project/controller.rb:18",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/controller.rb",
                    line: 18,
                },
            ],
            [":in `handle_request'"],
        ]);
    });

    test("Ruby backtrace with gem paths", () => {
        const trace = `/Users/developer/.rvm/gems/ruby-3.0.0/gems/activerecord-6.1.0/lib/active_record/connection_adapters/abstract_adapter.rb:87:in \`rescue in log'
    from /Users/developer/.rvm/gems/ruby-3.0.0/gems/activerecord-6.1.0/lib/active_record/connection_adapters/abstract_adapter.rb:78:in \`log'
    from /Users/developer/myapp/app/models/user.rb:25:in \`find_user'
    from /Users/developer/myapp/app/controllers/users_controller.rb:15:in \`show'`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            [
                "/Users/developer/.rvm/gems/ruby-3.0.0/gems/activerecord-6.1.0/lib/active_record/connection_adapters/abstract_adapter.rb:87",
                {
                    type: "FilePath",
                    filePath: "/Users/developer/.rvm/gems/ruby-3.0.0/gems/activerecord-6.1.0/lib/active_record/connection_adapters/abstract_adapter.rb",
                    line: 87,
                },
            ],
            [":in `rescue in log'"],
        ]);

        expect(matches[2]).toEqual([
            ["    from "],
            [
                "/Users/developer/myapp/app/models/user.rb:25",
                {
                    type: "FilePath",
                    filePath: "/Users/developer/myapp/app/models/user.rb",
                    line: 25,
                },
            ],
            [":in `find_user'"],
        ]);
    });

    test("Ruby backtrace with block notation", () => {
        const trace = `script.rb:15:in \`block (2 levels) in <main>': Something went wrong (RuntimeError)
    from script.rb:12:in \`each'
    from script.rb:12:in \`block in <main>'
    from script.rb:10:in \`times'
    from script.rb:10:in \`<main>'`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            [
                "script.rb:15",
                {
                    type: "FilePath",
                    filePath: "script.rb",
                    line: 15,
                },
            ],
            [":in `block (2 levels) in <main>': Something went wrong (RuntimeError)"],
        ]);

        expect(matches[2]).toEqual([
            [
                "    from script.rb:12",
                {
                    type: "FilePath",
                    filePath: "    from script.rb",
                    line: 12,
                },
            ],
            [":in `block in <main>'"],
        ]);
    });

    test("Ruby backtrace with Windows paths", () => {
        const trace = `C:/Users/developer/project/app.rb:30:in \`calculate': division by zero (ZeroDivisionError)
    from C:/Users/developer/project/main.rb:8:in \`<main>'`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["C:"],
            [
                "/Users/developer/project/app.rb:30",
                {
                    type: "FilePath",
                    filePath: "/Users/developer/project/app.rb",
                    line: 30,
                },
            ],
            [":in `calculate': division by zero (ZeroDivisionError)"],
        ]);

        expect(matches[1]).toEqual([
            ["    from C:"],
            [
                "/Users/developer/project/main.rb:8",
                {
                    type: "FilePath",
                    filePath: "/Users/developer/project/main.rb",
                    line: 8,
                },
            ],
            [":in `<main>'"],
        ]);
    });

    test("Ruby backtrace with relative paths", () => {
        const trace = `./lib/parser.rb:45:in \`parse': Invalid syntax (SyntaxError)
    from ./lib/processor.rb:20:in \`process'
    from ./main.rb:5:in \`<main>'`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["."],
            [
                "/lib/parser.rb:45",
                {
                    type: "FilePath",
                    filePath: "/lib/parser.rb",
                    line: 45,
                },
            ],
            [":in `parse': Invalid syntax (SyntaxError)"],
        ]);

        expect(matches[1]).toEqual([
            ["    "],
            [
                "from ./lib/processor.rb:20",
                {
                    type: "FilePath",
                    filePath: "from ./lib/processor.rb",
                    line: 20,
                },
            ],
            [":in `process'"],
        ]);
    });

    test("Ruby backtrace with nested exceptions", () => {
        const trace = `app.rb:10:in \`outer': Outer error (RuntimeError)
    from app.rb:15:in \`<main>'
Caused by app.rb:5:in \`inner': Inner error (StandardError)
    from app.rb:8:in \`outer'`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            [
                "app.rb:10",
                {
                    type: "FilePath",
                    filePath: "app.rb",
                    line: 10,
                },
            ],
            [":in `outer': Outer error (RuntimeError)"],
        ]);

        expect(matches[2]).toEqual([
            [
                "Caused by app.rb:5",
                {
                    type: "FilePath",
                    filePath: "Caused by app.rb",
                    line: 5,
                },
            ],
            [":in `inner': Inner error (StandardError)"],
        ]);
    });
});
