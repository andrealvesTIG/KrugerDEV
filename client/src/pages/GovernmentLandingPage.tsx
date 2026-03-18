import IndustryLandingPage from "@/components/landing/IndustryLandingPage";
import { governmentConfig } from "@/data/landing/governmentConfig";

export default function GovernmentLandingPage() {
  return <IndustryLandingPage config={governmentConfig} />;
}
