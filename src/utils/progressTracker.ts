export interface IProgressReporter {
    report(fraction: number): void;
    complete(): void;
}

export class ProgressTracker implements IProgressReporter {
    private readonly onReport;

    public constructor(onReport: (fraction: number) => void) {
        this.onReport = onReport;
    }

    public report(fraction: number): void {
        this.onReport(Math.max(0, Math.min(1, fraction)));
    }

    public complete(): void {
        this.report(1);
    }
}

export class ProgressSplitter {
    private readonly fractions: number[] = [];
    private readonly target: IProgressReporter;

    public constructor(target: IProgressReporter = { report: () => {}, complete: () => {} }) {
        this.target = target;
    }

    public get fraction(): number {
        if (this.fractions.length === 0) return 0;
        return this.fractions.reduce((sum, f) => sum + f, 0) / this.fractions.length;
    }

    public createChild(): IProgressReporter {
        const index = this.fractions.length;
        this.fractions.push(0);
        this.notify();
        return new ProgressTracker(fraction => {
            this.fractions[index] = fraction;
            this.notify();
        });
    }

    private notify(): void {
        this.target.report(this.fraction);
    }
}

export function createDeltaProgressTracker(onDelta: (delta: number) => void): IProgressReporter {
    let lastFraction = 0;
    return new ProgressTracker(fraction => {
        const delta = fraction - lastFraction;
        if (delta > 0) onDelta(delta);
        lastFraction = fraction;
    });
}
