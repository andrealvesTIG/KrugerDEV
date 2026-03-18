import IndustryLandingPage from "@/components/landing/IndustryLandingPage";
import { manufacturingConfig } from "@/data/landing/manufacturingConfig";

export default function ManufacturingLandingPage() {
  return <IndustryLandingPage config={manufacturingConfig} />;
}
