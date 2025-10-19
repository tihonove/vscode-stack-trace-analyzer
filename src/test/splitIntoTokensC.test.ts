import { splitIntoTokens } from "../stackTraceSplitter";

describe("C stack traces", () => {
    test("C/C++ debugger (cppdbg) stack trace", () => {
        const trace = `
RelationCloseCleanup(Relation relation) (\\workspaces\\postgres\\src\\backend\\utils\\cache\\relcache.c:2210)
RelationClose(Relation relation) (\\workspaces\\postgres\\src\\backend\\utils\\cache\\relcache.c:2199)
relation_close(Relation relation, LOCKMODE lockmode, LOCKMODE lockmode@entry) (\\workspaces\\postgres\\src\\backend\\access\\common\\relation.c:212)
table_close(Relation relation, LOCKMODE lockmode, LOCKMODE lockmode@entry) (\\workspaces\\postgres\\src\\backend\\access\\table\\table.c:128)
ExecCloseRangeTableRelations(EState * estate) (\\workspaces\\postgres\\src\\backend\\executor\\execMain.c:1583)
ExecEndPlan(EState * estate) (\\workspaces\\postgres\\src\\backend\\executor\\execMain.c:1509)
standard_ExecutorEnd(QueryDesc * queryDesc) (\\workspaces\\postgres\\src\\backend\\executor\\execMain.c:494)
PortalCleanup(Portal portal) (\\workspaces\\postgres\\src\\backend\\commands\\portalcmds.c:299)
PortalDrop(Portal portal, _Bool isTopCommit) (\\workspaces\\postgres\\src\\backend\\utils\\mmgr\\portalmem.c:502)
exec_simple_query(const char * query_string) (\\workspaces\\postgres\\src\\backend\\tcop\\postgres.c:1288)
PostgresMain(const char * dbname, const char * username) (\\workspaces\\postgres\\src\\backend\\tcop\\postgres.c:4767)
BackendMain(char * startup_data, size_t startup_data_len) (\\workspaces\\postgres\\src\\backend\\tcop\\backend_startup.c:105)
postmaster_child_launch(BackendType child_type, BackendType child_type@entry, char * startup_data, char * startup_data@entry, size_t startup_data_len, size_t startup_data_len@entry, ClientSocket * client_sock, ClientSocket * client_sock@entry) (\\workspaces\\postgres\\src\\backend\\postmaster\\launch_backend.c:277)
BackendStartup(ClientSocket * client_sock) (\\workspaces\\postgres\\src\\backend\\postmaster\\postmaster.c:3594)
ServerLoop() (\\workspaces\\postgres\\src\\backend\\postmaster\\postmaster.c:1676)
PostmasterMain(int argc, int argc@entry, char ** argv, char ** argv@entry) (\\workspaces\\postgres\\src\\backend\\postmaster\\postmaster.c:1374)
main(int argc, char ** argv) (\\workspaces\\postgres\\src\\backend\\main\\main.c:199)
        `;

        var matches = splitIntoTokens(trace);
        
        // Test the first line with function and file path
        expect(matches[1]).toEqual([
            ["RelationCloseCleanup(Relation relation) ("],
            [
                "\\workspaces\\postgres\\src\\backend\\utils\\cache\\relcache.c:2210",
                {
                    type: "FilePath",
                    filePath: "/workspaces/postgres/src/backend/utils/cache/relcache.c",
                    line: 2210,
                },
            ],
            [")"],
        ]);

        // Test another line with multiple parameters
        expect(matches[3]).toEqual([
            ["relation_close(Relation relation, LOCKMODE lockmode, LOCKMODE lockmode@entry) ("],
            [
                "\\workspaces\\postgres\\src\\backend\\access\\common\\relation.c:212",
                {
                    type: "FilePath",
                    filePath: "/workspaces/postgres/src/backend/access/common/relation.c",
                    line: 212,
                },
            ],
            [")"],
        ]);
    });

    test("C/C++ debugger stack trace with forward slashes", () => {
        const trace = `
main(int argc, char ** argv) (/workspaces/postgres/src/backend/main/main.c:199)
ExecEndPlan(EState * estate) (/workspaces/postgres/src/backend/executor/execMain.c:1509)
        `;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["main(int argc, char ** argv) ("],
            [
                "/workspaces/postgres/src/backend/main/main.c:199",
                {
                    type: "FilePath",
                    filePath: "/workspaces/postgres/src/backend/main/main.c",
                    line: 199,
                },
            ],
            [")"],
        ]);
    });

    test("C/C++ debugger stack trace with Windows paths", () => {
        const trace = `
main(int argc, char ** argv) (C:\\workspaces\\postgres\\src\\backend\\main\\main.c:199)
ExecEndPlan(EState * estate) (C:\\Users\\dev\\postgres\\src\\backend\\executor\\execMain.c:1509)
        `;

        var matches = splitIntoTokens(trace);
        
        expect(matches[1]).toEqual([
            ["main(int argc, char ** argv) ("],
            [
                "C:\\workspaces\\postgres\\src\\backend\\main\\main.c:199",
                {
                    type: "FilePath",
                    filePath: "C:/workspaces/postgres/src/backend/main/main.c",
                    line: 199,
                },
            ],
            [")"],
        ]);
    });
});
