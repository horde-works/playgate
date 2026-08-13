/**
 * Read/write cell owned by the world. Kept independent from React so the
 * creature boundary can be exercised by simulation tests and other runtimes.
 */
export interface WorldValue<T> {
  current: T;
}

/** Minimum authored geometry needed by a species-specific locomotion adapter. */
export interface CreatureWorldPiece {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly shape?: string;
  readonly material?: string;
  readonly hinge?: unknown;
}

/** World-calibrated impulse travelling with an acoustic event. */
export interface CreatureImpulseWave {
  readonly pushRadius: number;
  readonly horizontal: number;
  readonly vertical: number;
}

/**
 * A fact emitted by the world, not an instruction to a species. Humans,
 * felines and dragons may classify the same event differently.
 */
export interface AcousticEvent {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Sound pressure level at one metre, dB. */
  readonly level: number;
  /** Front steepness, 0..1. */
  readonly rise: number;
  readonly wave?: CreatureImpulseWave;
  /** A meaningful signal such as a horn, rather than an abrupt impact. */
  readonly signal?: boolean;
}

/** A continuously present source which a species may attend to or ignore. */
export interface CreaturePresence {
  readonly x: number;
  readonly y?: number;
  readonly z: number;
  readonly sourceId?: string;
}

export interface CreatureEventRead<T> {
  /** Cursor to pass into the next read. */
  readonly cursor: number;
  readonly events: readonly T[];
  /** Events lost because this reader fell behind the bounded journal. */
  readonly dropped: number;
}

export interface CreatureEventStream<T> {
  readonly latestSequence: number;
  readAfter(cursor: number): CreatureEventRead<T>;
}

export interface CreatureEventSink<T> extends CreatureEventStream<T> {
  publish(event: T): number;
  clear(): void;
}

interface SequencedEvent<T> {
  readonly sequence: number;
  readonly event: T;
}

/**
 * Small bounded multicast journal. Every population owns its cursor, so one
 * consumer cannot remove an event before another has observed it.
 */
export class CreatureEventJournal<T> implements CreatureEventSink<T> {
  private readonly capacity: number;
  private sequence = 0;
  private entries: SequencedEvent<T>[] = [];

  constructor(capacity = 128) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("CreatureEventJournal capacity must be a positive integer");
    }
    this.capacity = capacity;
  }

  get latestSequence(): number {
    return this.sequence;
  }

  publish(event: T): number {
    this.sequence += 1;
    this.entries.push({ sequence: this.sequence, event });
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
    return this.sequence;
  }

  readAfter(cursor: number): CreatureEventRead<T> {
    const safeCursor = Number.isFinite(cursor) ? Math.max(0, Math.floor(cursor)) : 0;
    const firstSequence = this.entries[0]?.sequence ?? this.sequence + 1;
    const dropped = Math.max(0, firstSequence - safeCursor - 1);
    return {
      cursor: this.sequence,
      events: this.entries
        .filter((entry) => entry.sequence > safeCursor)
        .map((entry) => entry.event),
      dropped,
    };
  }

  clear(): void {
    this.entries = [];
  }
}

/**
 * The portable boundary shared by living populations. It exposes world facts;
 * it deliberately does not expose homes, professions, paws, wings or routes.
 */
export interface CreatureWorldRuntime {
  readonly time: {
    readonly dayFraction: WorldValue<number>;
    readonly night: WorldValue<number>;
  };
  readonly geometry: {
    readonly pieces: readonly CreatureWorldPiece[];
    readonly removedPieceIds: WorldValue<ReadonlySet<string>>;
  };
  readonly stimuli: {
    readonly acoustic: CreatureEventStream<AcousticEvent>;
    readonly dangerousPresence: WorldValue<CreaturePresence | null>;
  };
}
