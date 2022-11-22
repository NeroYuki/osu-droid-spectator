/**
 * The result of a hit in an osu!droid replay.
 */
export enum HitResult {
    /**
     * Miss (0).
     */
    miss = 1,

    /**
     * Meh (50).
     */
    meh,

    /**
     * Good (100).
     */
    good,

    /**
     * Great (300).
     */
    great,
}
