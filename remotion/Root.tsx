import { Composition } from "remotion";
import { LoomVideo, loomVideoSchema } from "./compositions/LoomVideo";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LoomVideo"
        component={LoomVideo}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        schema={loomVideoSchema}
        defaultProps={{
          screenshotPath: "",
          talkingHeadPath: "",
          leadName: "Preview",
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.round((props.durationSec ?? 10) * FPS),
        })}
      />
    </>
  );
};
