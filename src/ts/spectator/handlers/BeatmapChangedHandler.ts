import { createHash } from "crypto";
import { audioState, resetAudio } from "../../elements/Audio";
import { background, clearBackground } from "../../elements/Background";
import { JSZipObject } from "jszip";
import { BeatmapDecoder, Modes } from "@rian8337/osu-base";
import {
    pickedBeatmap,
    setPickedBeatmap,
    setParsedBeatmap,
    resetBeatmapset,
    beatmapset,
    downloadBeatmapset,
    parsedBeatmap,
    cancelBeatmapsetDownload,
    setDroidStarRating,
    setStandardStarRating,
} from "../../settings/BeatmapSettings";
import {
    getBeatmapsetFromDB,
    storeBeatmapsetToDB,
} from "../../settings/DatabaseSettings";
import {
    dataProcessor,
    infoDisplay,
    userHasInteracted,
} from "../../settings/SpectatorSettings";
import { PickedBeatmap } from "../rawdata/PickedBeatmap";
import { deletePreviews } from "../../settings/PreviewSettings";
import { toggleControlBar } from "../../elements/Body";
import {
    DroidDifficultyCalculator,
    OsuDifficultyCalculator,
} from "@rian8337/osu-difficulty-calculator";
import { mods } from "../../settings/RoomSettings";

/**
 * A handler responsible for handling beatmap changed events.
 */
export abstract class BeatmapChangedHandler {
    // eslint-disable-next-line no-control-regex
    private static readonly fileNameCleanerRegex = /[^\x00-\x7F]/g;

    /**
     * Handles a beatmap changed event.
     *
     * Includes logic for reloading of rooms (i.e. for another gameplay with the same beatmap).
     *
     * @param newBeatmap The new beatmap.
     */
    static async handle(newBeatmap?: PickedBeatmap | null): Promise<void> {
        if (!newBeatmap) {
            $("#title a").text("No beatmap is picked in room");
            return;
        }

        const beatmapTitle = $("#title a");
        beatmapTitle.text("Loading...").removeProp("href");

        cancelBeatmapsetDownload();

        if (newBeatmap.md5 !== pickedBeatmap?.md5) {
            // Only reset the processor and previews if it's a new beatmap, in which case the spectator data is invalid.
            dataProcessor.reset();
            deletePreviews();
        }

        const currentBeatmapsetId = pickedBeatmap?.beatmapSetId;
        const newBeatmapsetId = newBeatmap.beatmapSetId;

        if (!newBeatmapsetId) {
            $("#title a").text("Beatmap not found in mirror, sorry!");
            return;
        }

        const beatmapText = `${newBeatmap.artist} - ${newBeatmap.title} (${newBeatmap.creator}) [${newBeatmap.version}]`;
        const notFoundText = `${beatmapText} (not found in mirror)`;

        let alreadyAttemptDownload = false;

        if (!parsedBeatmap || newBeatmapsetId !== currentBeatmapsetId) {
            console.log("Beatmap changed to beatmapset ID", newBeatmapsetId);

            if (newBeatmapsetId !== currentBeatmapsetId) {
                resetBeatmapset();
                resetAudio(true);
                clearBackground();
            }

            let beatmapsetBlob = await getBeatmapsetFromDB(newBeatmapsetId);

            if (!beatmapsetBlob) {
                beatmapsetBlob = await downloadBeatmapset(newBeatmapsetId);
                alreadyAttemptDownload = true;

                if (beatmapsetBlob) {
                    await storeBeatmapsetToDB(newBeatmapsetId, beatmapsetBlob);
                }
            }

            if (!beatmapsetBlob) {
                console.error(
                    "Beatmapset not found (already attempted download)",
                );

                beatmapTitle
                    .prop("href", `https://osu.ppy.sh/s/${newBeatmapsetId}`)
                    .text(notFoundText);
                return;
            }

            await beatmapset.loadAsync(beatmapsetBlob);
        }

        setParsedBeatmap(null);
        setDroidStarRating(null);
        setStandardStarRating(null);

        let entries = Object.values(beatmapset.files);
        let osuFile = await this.getOsuFile(entries, newBeatmap.md5);

        if (!osuFile) {
            if (alreadyAttemptDownload) {
                console.error(
                    "Beatmapset not found (already attempted download)",
                );

                beatmapTitle
                    .prop("href", `https://osu.ppy.sh/s/${newBeatmapsetId}`)
                    .text(notFoundText);
                return;
            }

            console.log(".osu file not found, redownloading beatmapset");

            const beatmapsetBlob = await downloadBeatmapset(newBeatmapsetId);
            if (!beatmapsetBlob) {
                beatmapTitle
                    .prop("href", `https://osu.ppy.sh/s/${newBeatmapsetId}`)
                    .text(notFoundText);
                return;
            }

            await storeBeatmapsetToDB(newBeatmapsetId, beatmapsetBlob);
            await beatmapset.loadAsync(beatmapsetBlob);

            entries = Object.values(beatmapset.files);
            osuFile = await this.getOsuFile(entries, newBeatmap.md5);
        }

        if (!osuFile) {
            console.error("Beatmap not found in beatmapset");

            beatmapTitle
                .prop("href", `https://osu.ppy.sh/s/${newBeatmapsetId}`)
                .text(notFoundText);
            return;
        }

        const backgroundBlob = await this.getBackgroundBlob(entries, osuFile);
        const audioBlob = await this.getAudioBlob(entries, osuFile);

        if (!backgroundBlob || !audioBlob) {
            console.error("Background or audio not found in beatmapset");

            beatmapTitle
                .prop("href", `https://osu.ppy.sh/s/${newBeatmapsetId}`)
                .text(`${beatmapText} (an error has occurred)`);
            return;
        }

        const newParsedBeatmap = new BeatmapDecoder().decode(
            osuFile,
            Modes.droid,
            false,
        ).result;
        const { metadata: newMetadata } = newParsedBeatmap;

        const droidDifficultyCalculator = new DroidDifficultyCalculator(
            newParsedBeatmap,
        ).calculate({ mods: mods });

        const standardDifficultyCalculator = new OsuDifficultyCalculator(
            newParsedBeatmap,
        ).calculate({ mods: mods });

        setPickedBeatmap(newBeatmap);
        setParsedBeatmap(newParsedBeatmap);
        setDroidStarRating(droidDifficultyCalculator.total);
        setStandardStarRating(standardDifficultyCalculator.total);

        background.src = backgroundBlob;
        audioState.audio.src = audioBlob;
        audioState.audio.load();

        beatmapTitle
            .prop(
                "href",
                `https://osu.ppy.sh/${newMetadata.beatmapId ? "b" : "s"}/${
                    newMetadata.beatmapId ??
                    newMetadata.beatmapSetId ??
                    newBeatmapsetId
                }`,
            )
            .text(newParsedBeatmap.metadata.fullTitle);

        if (!userHasInteracted) {
            $("#play").addClass("e");
        }

        infoDisplay.draw(0);
        toggleControlBar();
    }

    /**
     * Gets an .osu file from the beatmap.
     *
     * @param entries The zip entry of the beatmap.
     * @param hash The MD5 hash of the .osu file
     * @returns The .osu file.
     */
    private static async getOsuFile(
        entries: JSZipObject[],
        hash: string,
    ): Promise<string> {
        let osuFile = "";

        for (const entry of entries) {
            if (!entry.name.endsWith(".osu")) {
                continue;
            }

            const file = await entry.async("string");
            const fileHash = createHash("md5").update(file).digest("hex");

            if (hash !== fileHash) {
                continue;
            }

            osuFile = file;

            break;
        }

        return osuFile;
    }

    /**
     * Gets the background blob of a beatmap.
     *
     * @param entries The zip entry of the beatmap.
     * @param osuFile The .osu file.
     * @returns The background blob.
     */
    private static async getBackgroundBlob(
        entries: JSZipObject[],
        osuFile: string,
    ): Promise<string> {
        let backgroundBlob = "";
        const backgroundMatch = osuFile.match(/(?<=0,0,").+(?=")/);

        if (!backgroundMatch) {
            return backgroundBlob;
        }

        const backgroundFilename = backgroundMatch[0];

        for (const entry of entries) {
            if (entry.name !== backgroundFilename) {
                continue;
            }

            backgroundBlob = URL.createObjectURL(await entry.async("blob"));

            break;
        }

        if (!backgroundBlob) {
            // If not found, try cleaning file name first.
            for (const entry of entries) {
                if (
                    entry.name
                        .replace(this.fileNameCleanerRegex, "")
                        .toLowerCase() !==
                    backgroundFilename
                        .replace(this.fileNameCleanerRegex, "")
                        .toLowerCase()
                ) {
                    continue;
                }

                backgroundBlob = URL.createObjectURL(await entry.async("blob"));

                break;
            }
        }

        return backgroundBlob;
    }

    /**
     * Gets the audio blob of a beatmap.
     *
     * @param entries The zip entry of the beatmap.
     * @param osuFile The .osu file.
     * @returns The audio blob.
     */
    private static async getAudioBlob(
        entries: JSZipObject[],
        osuFile: string,
    ): Promise<string> {
        let audioBlob = "";
        const audioMatch = osuFile.match(/(?<=AudioFilename: ).+(?=)/);

        if (!audioMatch) {
            return audioBlob;
        }

        const audioFilename = audioMatch[0];

        for (const entry of entries) {
            if (entry.name !== audioFilename) {
                continue;
            }

            audioBlob = URL.createObjectURL(await entry.async("blob"));

            break;
        }

        if (!audioBlob) {
            // If not found, try cleaning file name first.
            for (const entry of entries) {
                if (
                    entry.name
                        .replace(this.fileNameCleanerRegex, "")
                        .toLowerCase() !==
                    audioFilename
                        .replace(this.fileNameCleanerRegex, "")
                        .toLowerCase()
                ) {
                    continue;
                }

                audioBlob = URL.createObjectURL(await entry.async("blob"));

                break;
            }
        }

        return audioBlob;
    }
}
