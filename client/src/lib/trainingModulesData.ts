import type { TrainingModule } from "./trainingData";
import modulesJson from "../data/trainingModules.json";

export const allModules: TrainingModule[] = modulesJson as TrainingModule[];
