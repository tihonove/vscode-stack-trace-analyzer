import { ProgressSplitter, createDeltaProgressTracker } from "../utils/progressTracker";

class ProgressLeaf {
    private _fraction = 0;
    private readonly onUpdate: (fraction: number) => void;

    constructor(onUpdate: (fraction: number) => void = () => {}) {
        this.onUpdate = onUpdate;
    }

    get fraction(): number {
        return this._fraction;
    }

    report(fraction: number): void {
        this._fraction = Math.max(0, Math.min(1, fraction));
        this.onUpdate(this._fraction);
    }

    complete(): void {
        this.report(1);
    }
}

describe("ProgressLeaf", () => {
    test("starts at 0", () => {
        const leaf = new ProgressLeaf();
        expect(leaf.fraction).toBe(0);
    });

    test("report() sets fraction", () => {
        const leaf = new ProgressLeaf();
        leaf.report(0.5);
        expect(leaf.fraction).toBe(0.5);
    });

    test("complete() sets fraction to 1", () => {
        const leaf = new ProgressLeaf();
        leaf.complete();
        expect(leaf.fraction).toBe(1);
    });

    test("report() clamps to [0, 1]", () => {
        const leaf = new ProgressLeaf();
        leaf.report(1.5);
        expect(leaf.fraction).toBe(1);
        leaf.report(-0.5);
        expect(leaf.fraction).toBe(0);
    });

    test("onUpdate is called on report()", () => {
        const updates: number[] = [];
        const leaf = new ProgressLeaf(f => updates.push(f));
        leaf.report(0.3);
        leaf.report(0.7);
        leaf.complete();
        expect(updates).toEqual([0.3, 0.7, 1]);
    });
});

describe("ProgressSplitter", () => {
    test("starts with fraction 0 when no children", () => {
        const tracker = new ProgressSplitter();
        expect(tracker.fraction).toBe(0);
    });

    test("parent with one incomplete child has fraction 0", () => {
        const tracker = new ProgressSplitter();
        tracker.createChild();
        expect(tracker.fraction).toBe(0);
    });

    test("parent with one complete child has fraction 1", () => {
        const tracker = new ProgressSplitter();
        const child = tracker.createChild();
        child.complete();
        expect(tracker.fraction).toBe(1);
    });

    test("parent fraction is average of children", () => {
        const tracker = new ProgressSplitter();
        const child1 = tracker.createChild();
        const child2 = tracker.createChild();
        child1.complete();
        expect(tracker.fraction).toBe(0.5);
        child2.complete();
        expect(tracker.fraction).toBe(1);
    });

    test("adding a new child decreases fraction (dynamic expansion)", () => {
        const tracker = new ProgressSplitter();
        const child1 = tracker.createChild();
        child1.complete();
        expect(tracker.fraction).toBe(1);

        tracker.createChild(); // новый незавершённый ребёнок
        expect(tracker.fraction).toBe(0.5);
    });

    test("onUpdate is called when child is created", () => {
        const updates: number[] = [];
        const tracker = new ProgressSplitter({ report: f => updates.push(f), complete: () => {} });
        tracker.createChild();
        expect(updates).toEqual([0]);
    });

    test("onUpdate is called when child completes", () => {
        const updates: number[] = [];
        const tracker = new ProgressSplitter({ report: f => updates.push(f), complete: () => {} });
        const child = tracker.createChild();
        child.complete();
        expect(updates).toEqual([0, 1]);
    });

    test("onUpdate propagates through nested children", () => {
        const updates: number[] = [];
        const root = new ProgressSplitter({ report: f => updates.push(f), complete: () => {} });
        const child = root.createChild();
        const grandchild = new ProgressSplitter(child).createChild();
        grandchild.complete();
        expect(updates[updates.length - 1]).toBe(1);
    });

    test("two-level tree: partial progress", () => {
        const tracker = new ProgressSplitter();
        const c1 = tracker.createChild();
        const c2 = tracker.createChild();
        const c1Splitter = new ProgressSplitter(c1);
        const c1a = c1Splitter.createChild();
        const c1b = c1Splitter.createChild();
        c1a.complete();
        expect(tracker.fraction).toBe(0.25);
        c1b.complete();
        expect(tracker.fraction).toBe(0.5);
        c2.complete();
        expect(tracker.fraction).toBe(1);
    });
});

describe("createDeltaProgressTracker", () => {
    test("calls onDelta with incremental deltas, not absolute fractions", () => {
        const deltas: number[] = [];
        const reporter = createDeltaProgressTracker(d => deltas.push(d));
        const splitter = new ProgressSplitter(reporter);
        const c1 = splitter.createChild();
        const c2 = splitter.createChild();
        c1.complete(); // fraction: 0 → 0.5, delta = 0.5
        c2.complete(); // fraction: 0.5 → 1, delta = 0.5
        expect(deltas).toEqual([0.5, 0.5]);
    });

    test("does not call onDelta when fraction does not increase", () => {
        const deltas: number[] = [];
        const reporter = createDeltaProgressTracker(d => deltas.push(d));
        const splitter = new ProgressSplitter(reporter);
        const c1 = splitter.createChild();
        c1.complete(); // fraction → 1
        splitter.createChild(); // fraction 1 → 0.5, delta negative — пропускаем
        expect(deltas).toEqual([1]);
    });

    test("total deltas sum to 1 after full completion", () => {
        const deltas: number[] = [];
        const reporter = createDeltaProgressTracker(d => deltas.push(d));
        const splitter = new ProgressSplitter(reporter);
        const c1 = splitter.createChild();
        const c2 = splitter.createChild();
        const c3 = splitter.createChild();
        c1.complete();
        c2.complete();
        c3.complete();
        const total = deltas.reduce((s, d) => s + d, 0);
        expect(total).toBeCloseTo(1);
    });
});
