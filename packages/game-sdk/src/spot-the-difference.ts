export type SpotTheDifferenceSpot = {
  id: string;
  label: string;
  radius: number;
  x: number;
  y: number;
};

export type SpotTheDifferenceScene = {
  difficulty: "easy" | "medium" | "hard";
  id: string;
  leftCaption: string;
  rightCaption: string;
  spots: SpotTheDifferenceSpot[];
  timeLimitSeconds: number;
  title: string;
};

export const defaultSpotTheDifferenceScenes: readonly SpotTheDifferenceScene[] = [
  {
    difficulty: "medium",
    id: "cabin-window-evening",
    leftCaption: "Left Cabin View",
    rightCaption: "Right Cabin View",
    spots: [
      { id: "window-shade-01", label: "Window Shade", radius: 0.05, x: 0.22, y: 0.28 },
      { id: "tray-table-02", label: "Tray Table", radius: 0.05, x: 0.58, y: 0.64 },
      { id: "seat-pocket-03", label: "Seat Pocket", radius: 0.05, x: 0.74, y: 0.52 },
      { id: "reading-light-04", label: "Reading Light", radius: 0.05, x: 0.46, y: 0.12 },
      { id: "headrest-05", label: "Headrest Stripe", radius: 0.05, x: 0.34, y: 0.46 }
    ],
    timeLimitSeconds: 90,
    title: "Cabin Window Evening"
  }
] as const;
