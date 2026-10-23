/** Owns which bundled reader a learner can open without any key; the syllabus decides, not the UI. */
import syllabus from '../../../data/graded-readers/syllabus.json';

/** The stages this needs; the committed syllabus is validated against the full schema by the reader tests. */
interface Stages {
  stages: { readerId: string; bundled: boolean }[];
}

/** The first bundled stage's reader id, or undefined while no stage is bundled (never an invented reader). */
export const firstBundledReaderId = (data: Stages = syllabus): string | undefined =>
  data.stages.find((stage) => stage.bundled)?.readerId;
