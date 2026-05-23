export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([promise, delay(ms).then(() => Promise.reject(new Error(`Timeout after ${ms}ms`)))]);
}
