import {
    getOsuFile,
    getBackgroundBlob,
    getAudioBlob,
} from "../../BeatmapParsingUtilities";
import { ChimuAPIResponse } from "../../ChimuAPIResponse";
import { audioState, resetAudio } from "../../elements/Audio";
import { background, clearBackground } from "../../elements/Background";
import { BeatmapDecoder } from "../../osu-base";
import {
    pickedBeatmap,
    parsedBeatmap,
    setPickedBeatmap,
    setParsedBeatmap,
    calculateMaxScore,
} from "../../settings/BeatmapSettings";
import { reloadPreview } from "../../settings/PreviewSettings";
import { initProcessor } from "../../settings/SpectatorSettings";
import { ZipReader, BlobReader } from "../../zip-js";
import { PickedBeatmap } from "../rawdata/PickedBeatmap";

/**
 * A handler responsible for handling beatmap changed events.
 */
export abstract class BeatmapChangedHandler {
    /**
     * Handles a beatmap changed event.
     *
     * Includes logic for reloading of rooms (i.e. for another gameplay with the same beatmap).
     *
     * @param newBeatmap The new beatmap, if any.
     */
    static async handle(newBeatmap?: PickedBeatmap): Promise<void> {
        if (
            !parsedBeatmap ||
            (newBeatmap && newBeatmap.id !== pickedBeatmap?.id)
        ) {
            console.log("Beatmap changed");

            resetAudio(true);
            reloadPreview();
            clearBackground();

            const beatmapToLoad = newBeatmap ?? pickedBeatmap;

            $("#title a").text("Loading...").removeProp("href");

            if (!beatmapToLoad) {
                throw new Error("No beatmaps to load");
            }

            const beatmapId = beatmapToLoad.id;
            let backgroundBlob = "";
            let audioBlob = "";
            let osuFile = "";

            // TODO: switch to sayobot
            const apiResponse = await fetch(
                `https://api.chimu.moe/v1/map/${beatmapId}`
            );
            let data: ChimuAPIResponse | undefined;
            try {
                data = await apiResponse.json();
            } catch {
                data = undefined;
            }

            if (data?.FileMD5 !== beatmapToLoad.hash) {
                $("#title a").text("Beatmap not found in mirror, sorry!");
                return;
            }

            const { OsuFile: osuFileName, DownloadPath } = data;

            const downloadResponse = await fetch(
                `https://chimu.moe/${DownloadPath}`
            );

            if (
                downloadResponse.status >= 400 &&
                downloadResponse.status < 200
            ) {
                $("#title a").text("Beatmap not found in mirror, sorry!");
                return;
            }

            const blob = await downloadResponse.blob();
            const reader = new ZipReader(new BlobReader(blob));

            const entries = await reader.getEntries();
            osuFile = await getOsuFile(entries, osuFileName);

            if (osuFile) {
                backgroundBlob = await getBackgroundBlob(entries, osuFile);
                audioBlob = await getAudioBlob(entries, osuFile);
            }

            await reader.close();

            if (backgroundBlob && osuFile) {
                setPickedBeatmap(beatmapToLoad);
                setParsedBeatmap(new BeatmapDecoder().decode(osuFile).result);
                calculateMaxScore();
                initProcessor();

                background.src = backgroundBlob;
                audioState.audio.src = audioBlob;

                $("#title a")
                    .prop("href", `//osu.ppy.sh/b/${beatmapId}`)
                    .text(beatmapToLoad.name);
                $("#play").addClass("e");
            } else {
                $("#title a").text("An error has occurred, sorry!");
            }
        }
    }
}
