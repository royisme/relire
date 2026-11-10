/** Test-only entry: exercises the unused P4-A service without adding an app consumer. */
import * as materials from '../src/services/importMaterial';

declare global {
  interface Window {
    materials: typeof materials;
  }
}
window.materials = materials;
