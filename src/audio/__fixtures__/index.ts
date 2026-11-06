import type { AudioFramePacket } from '../../types/audio';
import { createSilence } from './silence';
import { createSineSweep } from './sineSweep';
import { createImpulseTrain } from './impulseTrain';
import { createBrickwallNoise } from './brickwallNoise';
import { createMusicLike } from './musicLike';

export type FixtureId = 'silence' | 'sineSweep' | 'impulseTrain' | 'brickwall' | 'musicLike';

export interface FixtureRunner {
  readonly id: FixtureId;
  /** Must be called monotonically: t >= previous t. */
  frameAt(t: number): AudioFramePacket;
  reset(): void;
}

/** Builds the fixture selected by id. Every runner reuses its arrays and packet object. */
export function createFixtureRunner(id: FixtureId): FixtureRunner {
  switch (id) {
    case 'silence': return createSilence();
    case 'sineSweep': return createSineSweep();
    case 'impulseTrain': return createImpulseTrain();
    case 'brickwall': return createBrickwallNoise();
    case 'musicLike': return createMusicLike();
  }
}

// role: fixture registry / factory — the only entry point App and tests use to obtain audio.
// invariants: exhaustive over FixtureId; runners are stateful but deterministic in t; factory is
//             called once per mount, never per frame.
// owner milestone: M3a
