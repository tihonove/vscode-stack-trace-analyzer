export type TokenMeta = {
    type: "FilePath";
    [key: string]: any;
    vcsInfo?: {
        lastChangeCommit: CommitInfo
    };
    fileUriPath: string;
} | {
    type: "Symbol";
    symbols: string[];
};

export type Token = [string] | [string, undefined] | [string, TokenMeta];

export type CommitInfo = {
    authorName: any;
    hash: string;
    message: string;
    authorDate: Date;
}