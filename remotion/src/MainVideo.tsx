import { AbsoluteFill } from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Backdrop } from "./components/Backdrop";
import { SceneHook } from "./scenes/SceneHook";
import { ScenePatient } from "./scenes/ScenePatient";
import { SceneCaregiver } from "./scenes/SceneCaregiver";
import { SceneAlert } from "./scenes/SceneAlert";
import { SceneClose } from "./scenes/SceneClose";

const T = 20;
const timing = springTiming({ config: { damping: 200 }, durationInFrames: T });

export const MainVideo: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={150}>
        <SceneHook />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={190}>
        <ScenePatient />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={200}>
        <SceneCaregiver />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={190}>
        <SceneAlert />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={250}>
        <SceneClose />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
