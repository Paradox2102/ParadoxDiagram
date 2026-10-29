// The example robot (examples/example-robot.paradox.json, 5 KB) is in the build, so New can start from it.
import example from '../../examples/example-robot.paradox.json';
import type { Catalog } from '../catalog/catalog';
import type { Doc } from './types';
import { validateDoc } from './validate';

/** A fresh copy of the example robot, checked like a file that a person opens. */
export function exampleDoc(catalog: Catalog | null): Doc {
  return validateDoc(structuredClone(example), catalog).doc;
}
