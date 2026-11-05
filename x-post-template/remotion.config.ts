// Remotion settings. The video imports the handwriting engine (../engine) and the site's own code (../app/src)
// through the same aliases the site uses, so every frame is drawn by the real engine. https://www.remotion.dev/docs/config
import path from 'node:path';
import { Config } from '@remotion/cli/config';

const root = path.resolve(process.cwd(), '..');

Config.setVideoImageFormat('png'); // frames as PNG: no JPEG ringing around thin strokes
Config.setCodec('h264');
Config.setPixelFormat('yuv420p'); // what X plays
Config.setCrf(18);
Config.setChromiumOpenGlRenderer('angle'); // a real GPU for the engine's WebGL ink
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias as Record<string, string>),
      '@engine': path.join(root, 'engine/index.js'),
      '@': path.join(root, 'app/src'),
    },
  },
}));
