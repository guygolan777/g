import { createFileRoute, redirect } from "@tanstack/react-router";

// "קרוב אליי" is no longer a separate screen; old links land on discovery (which sorts by distance too).
export const Route = createFileRoute("/nearby")({
  beforeLoad: () => {
    throw redirect({ to: "/discover", search: { section: "nearby" }, replace: true });
  },
});
