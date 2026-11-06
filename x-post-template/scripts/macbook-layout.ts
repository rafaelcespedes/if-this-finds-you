// Prints the MacBook layout (src/macbook.ts) as JSON, for scripts/take-hands.py.
import { MAC_KEYS, WELL, TRACKPAD, PITCH } from '../src/macbook';
process.stdout.write(JSON.stringify({ pitch: PITCH, keys: MAC_KEYS, well: WELL, trackpad: TRACKPAD }));
