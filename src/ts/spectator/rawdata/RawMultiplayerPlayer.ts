import { SerializedMod } from "@rian8337/osu-base";
import { MultiplayerTeam } from "../structures/MultiplayerTeam";

/**
 * The raw shape of a player as received from the server.
 *
 * The server uses `id` rather than `uid`.
 */
export interface RawMultiplayerPlayer {
    /**
     * The uid of the player as sent by the server.
     */
    readonly id: number;

    /**
     * The username of the player.
     */
    readonly username: string;

    /**
     * The mods used by the player.
     */
    readonly mods: SerializedMod[];

    /**
     * The team this player is at, if in Team VS team mode.
     */
    team: MultiplayerTeam | null;
}
