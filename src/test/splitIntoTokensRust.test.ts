import { splitIntoTokens } from "../stackTraceSplitter";

describe("Rust stack traces", () => {
    test("Basic Rust panic", () => {
        const trace = `thread 'main' panicked at 'called \`Option::unwrap()\` on a \`None\` value', src/main.rs:10:9  
stack backtrace:  
   0: rust_begin_unwind  
   1: core::panicking::panic_fmt  
   2: core::panicking::panic  
   3: playground::main::h91d2...  
   4: core::ops::function::FnOnce::call_once
   5: std::sys_common::backtrace::__rust_begin_short_backtrace
   6: std::rt::lang_start::{{closure}}
   7: std::rt::lang_start_internal
   8: main
   9: __libc_start_main`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["thread 'main' panicked at 'called `Option::unwrap()` on a `None` value', "],
            [
                "src/main.rs:10:9",
                {
                    type: "FilePath",
                    filePath: "src/main.rs",
                    line: 10,
                    column: 9,
                },
            ],
            ["  "],
        ]);
    });

    test("Rust panic with file paths in backtrace", () => {
        const trace = `thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 5', src/lib.rs:42:5
stack backtrace:
   0: rust_begin_unwind
             at /rustc/9bc8c42bb2f19e745a63f3445f1ac248fb015e53/library/std/src/panicking.rs:493:5
   1: core::panicking::panic_fmt
             at /rustc/9bc8c42bb2f19e745a63f3445f1ac248fb015e53/library/core/src/panicking.rs:92:14
   2: core::panicking::panic_bounds_check
             at /rustc/9bc8c42bb2f19e745a63f3445f1ac248fb015e53/library/core/src/panicking.rs:69:5
   3: myapp::process_data
             at ./src/lib.rs:42:5
   4: myapp::main
             at ./src/main.rs:15:5`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["thread 'main' panicked at 'index out of bounds: the len is 3 but the index is 5', "],
            [
                "src/lib.rs:42:5",
                {
                    type: "FilePath",
                    filePath: "src/lib.rs",
                    line: 42,
                    column: 5,
                },
            ],
        ]);

        expect(matches[3]).toEqual([
            ["             "],
            ["at "],
            [
                "/rustc/9bc8c42bb2f19e745a63f3445f1ac248fb015e53/library/std/src/panicking.rs:493:5",
                {
                    type: "FilePath",
                    filePath: "/rustc/9bc8c42bb2f19e745a63f3445f1ac248fb015e53/library/std/src/panicking.rs",
                    line: 493,
                    column: 5,
                },
            ],
        ]);

        expect(matches[8]).toEqual([
            ["   3: myapp::process_data"],
        ]);

        expect(matches[9]).toEqual([
            ["             "],
            ["at "],
            [
                "./src/lib.rs:42:5",
                {
                    type: "FilePath",
                    filePath: "./src/lib.rs",
                    line: 42,
                    column: 5,
                },
            ],
        ]);
    });

    test("Rust panic with absolute paths", () => {
        const trace = `thread 'main' panicked at 'assertion failed: x == y', /home/user/project/src/calculator.rs:28:9
note: run with \`RUST_BACKTRACE=1\` environment variable to display a backtrace`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["thread 'main' panicked at 'assertion failed: x == y', "],
            [
                "/home/user/project/src/calculator.rs:28:9",
                {
                    type: "FilePath",
                    filePath: "/home/user/project/src/calculator.rs",
                    line: 28,
                    column: 9,
                },
            ],
        ]);
    });

    test("Rust panic with Windows paths", () => {
        const trace = `thread 'main' panicked at 'division by zero', C:\\Users\\developer\\project\\src\\math.rs:15:5
stack backtrace:
   0: std::panicking::begin_panic
             at C:\\Users\\developer\\.rustup\\toolchains\\stable-x86_64-pc-windows-msvc\\lib\\rustlib\\src\\rust\\library\\std\\src\\panicking.rs:519:12
   1: myapp::divide
             at C:\\Users\\developer\\project\\src\\math.rs:15:5
   2: myapp::main
             at C:\\Users\\developer\\project\\src\\main.rs:8:5`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["thread 'main' panicked at 'division by zero', "],
            [
                "C:\\Users\\developer\\project\\src\\math.rs:15:5",
                {
                    type: "FilePath",
                    filePath: "C:/Users/developer/project/src/math.rs",
                    line: 15,
                    column: 5,
                },
            ],
        ]);

        expect(matches[3]).toEqual([
            ["             "],
            ["at "],
            [
                "C:\\Users\\developer\\.rustup\\toolchains\\stable-x86_64-pc-windows-msvc\\lib\\rustlib\\src\\rust\\library\\std\\src\\panicking.rs:519:12",
                {
                    type: "FilePath",
                    filePath: "C:/Users/developer/.rustup/toolchains/stable-x86_64-pc-windows-msvc/lib/rustlib/src/rust/library/std/src/panicking.rs",
                    line: 519,
                    column: 12,
                },
            ],
        ]);

        expect(matches[5]).toEqual([
            ["             "],
            ["at "],
            [
                "C:\\Users\\developer\\project\\src\\math.rs:15:5",
                {
                    type: "FilePath",
                    filePath: "C:/Users/developer/project/src/math.rs",
                    line: 15,
                    column: 5,
                },
            ],
        ]);
    });

    test("Rust panic with unwrap error", () => {
        const trace = `thread 'main' panicked at 'called \`Result::unwrap()\` on an \`Err\` value: Os { code: 2, kind: NotFound, message: "No such file or directory" }', src/file_handler.rs:23:37
stack backtrace:
   0: rust_begin_unwind
   1: core::result::unwrap_failed
   2: myapp::file_handler::read_config
             at ./src/file_handler.rs:23:37
   3: myapp::main
             at ./src/main.rs:10:5`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["thread 'main' panicked at 'called `Result::unwrap()` on an `Err` value: Os { code: 2, kind: NotFound, message: \"No such file or directory\" }', "],
            [
                "src/file_handler.rs:23:37",
                {
                    type: "FilePath",
                    filePath: "src/file_handler.rs",
                    line: 23,
                    column: 37,
                },
            ],
        ]);

        expect(matches[5]).toEqual([
            ["             "],
            ["at "],
            [
                "./src/file_handler.rs:23:37",
                {
                    type: "FilePath",
                    filePath: "./src/file_handler.rs",
                    line: 23,
                    column: 37,
                },
            ],
        ]);
    });

    test("Rust panic with module paths", () => {
        const trace = `thread 'main' panicked at 'explicit panic', src/utils/parser.rs:67:9
stack backtrace:
   0: rust_begin_unwind
   1: core::panicking::panic
   2: myapp::utils::parser::parse_input
             at ./src/utils/parser.rs:67:9
   3: myapp::app::process
             at ./src/app.rs:45:18
   4: myapp::main
             at ./src/main.rs:12:5`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["thread 'main' panicked at 'explicit panic', "],
            [
                "src/utils/parser.rs:67:9",
                {
                    type: "FilePath",
                    filePath: "src/utils/parser.rs",
                    line: 67,
                    column: 9,
                },
            ],
        ]);

        expect(matches[5]).toEqual([
            ["             "],
            ["at "],
            [
                "./src/utils/parser.rs:67:9",
                {
                    type: "FilePath",
                    filePath: "./src/utils/parser.rs",
                    line: 67,
                    column: 9,
                },
            ],
        ]);

        expect(matches[7]).toEqual([
            ["             "],
            ["at "],
            [
                "./src/app.rs:45:18",
                {
                    type: "FilePath",
                    filePath: "./src/app.rs",
                    line: 45,
                    column: 18,
                },
            ],
        ]);
    });

    test("Rust panic with workspace paths", () => {
        const trace = `thread 'main' panicked at 'not implemented', /home/developer/workspace/myproject/backend/src/api/handlers.rs:102:13
stack backtrace:
   0: std::panicking::begin_panic
   1: backend::api::handlers::create_user
             at /home/developer/workspace/myproject/backend/src/api/handlers.rs:102:13
   2: backend::main
             at /home/developer/workspace/myproject/backend/src/main.rs:25:5`;

        var matches = splitIntoTokens(trace);
        
        expect(matches[0]).toEqual([
            ["thread 'main' panicked at 'not implemented', "],
            [
                "/home/developer/workspace/myproject/backend/src/api/handlers.rs:102:13",
                {
                    type: "FilePath",
                    filePath: "/home/developer/workspace/myproject/backend/src/api/handlers.rs",
                    line: 102,
                    column: 13,
                },
            ],
        ]);

        expect(matches[4]).toEqual([
            ["             "],
            ["at "],
            [
                "/home/developer/workspace/myproject/backend/src/api/handlers.rs:102:13",
                {
                    type: "FilePath",
                    filePath: "/home/developer/workspace/myproject/backend/src/api/handlers.rs",
                    line: 102,
                    column: 13,
                },
            ],
        ]);
    });
});
