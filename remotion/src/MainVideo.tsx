import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { Backdrop } from "./components/Backdrop";
import { SceneHook } from "./scenes/SceneHook";
import { ScenePatient } from "./scenes/ScenePatient";
import { SceneNotifiche } from "./scenes/SceneNotifiche";
import { SceneCaregiver } from "./scenes/SceneCaregiver";
import { SceneAlert } from "./scenes/SceneAlert";
import { SceneScorte } from "./scenes/SceneScorte";
import { SceneVitals } from "./scenes/SceneVitals";
import { SceneStorico } from "./scenes/SceneStorico";
import { SceneClose } from "./scenes/SceneClose";

const T = 20;
const timing = springTiming({ config: { damping: 200 }, durationInFrames: T });
const slideL = slide({ direction: "from-right" });
const slideU = slide({ direction: "from-bottom" });
const wipeL = wipe({ direction: "from-left" });

export const MainVideo: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={110}>
        <SceneHook />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideL} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={130}>
        <ScenePatient />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideU} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={115}>
        <SceneNotifiche />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideL} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={130}>
        <SceneCaregiver />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeL} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={120}>
        <SceneAlert />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideU} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={105}>
        <SceneScorte />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slideL} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={120}>
        <SceneVitals />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipeL} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={115}>
        <SceneStorico />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />

      <TransitionSeries.Sequence durationInFrames={115}>
        <SceneClose />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
