export function regexMatchCount(str: string, regex: RegExp): number {
    let count = 0;
    while (regex.exec(str) != null) {
        count++;
    }
    return count;
}

export function intersperse<T>(arr: T[], separator: T): T[] {
    return arr.length === 0 ? [] : arr.slice(1).reduce<T[]>((r: T[], item: T) => [...r, separator, item], [arr[0] as T]);
}
