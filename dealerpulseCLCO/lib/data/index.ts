import raw from "../../data/dealership_data.json";
import { normalize } from "./normalize.ts";
export const loadDataset = () => normalize(raw);
