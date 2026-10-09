/* Onboarding Tour — /repos/:repoId/tour (L05).
   A five-section guide to an unfamiliar repository. The page is a server
   component; the client leaf owns the params, the shell and the view (which owns
   the data, the expanded state and the Regenerate dialog). */
import React from "react";
import { TourPage } from "./_components/TourPage";

export default function OnboardingTourPage() {
  return <TourPage />;
}
