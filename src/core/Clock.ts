export interface Clock {
  time(): number;
  seek(s: number): void;
}

export class RealtimeClock implements Clock {
  private t = 0;
  time(): number { return this.t; }
  seek(s: number): void { this.t = s; }
  advance(dt: number): void { this.t += dt; }
}

export class OfflineStepClock implements Clock {
  private t = 0;
  constructor(private readonly fixedDt: number) {}
  time(): number { return this.t; }
  seek(s: number): void { this.t = s; }
  step(): void { this.t += this.fixedDt; }
}

// role: transport time source — realtime (rAF-driven) and fixed-step (offline export).
// invariants: time only moves via advance()/step()/seek(); no wall-clock reads inside, so the
//             export path stays deterministic; dt clamping lives in the caller (App).
// owner milestone: M1
