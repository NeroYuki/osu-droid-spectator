import { askRoomID } from "./RoomLoader";
import { openDatabase } from "./settings/DatabaseSettings";

(async () => {
    const fonts = [
        ["Torus-Thin", 100],
        ["Torus-Light", 300],
        ["Torus-Regular", 400],
        ["Torus-SemiBold", 600],
        ["Torus-SemiBold", 700],
        ["Torus-Bold", 800],
        ["Torus-Heavy", 900],
    ] as const;

    for (const [fontFile, weight] of fonts) {
        try {
            const face = new FontFace(
                "Torus",
                `url(./assets/${fontFile}.otf)`,
                {
                    weight: weight.toString(),
                },
            );

            await face.load();

            document.fonts.add(face);
        } catch (e) {
            console.error(e);
        }
    }

    await openDatabase();

    askRoomID();
})().catch(console.error);
