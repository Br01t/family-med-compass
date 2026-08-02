import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { Tutorial, totalFrames } from "./faq/Tutorial";
import { FAQ_VIDEOS } from "./faq/data";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
    />
    {Object.entries(FAQ_VIDEOS).map(([id, props]) => (
      <Composition
        key={id}
        id={id}
        component={Tutorial}
        durationInFrames={totalFrames(props.steps.length)}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={props}
      />
    ))}
  </>
);
