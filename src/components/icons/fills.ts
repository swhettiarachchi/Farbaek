/** Farbaek's icons as a state: the filled form of the ones a state is said with. An icon with none here is drawn outlined. */
import { CIRCLE, FOLDER, SEAL, SHIELD, SQUARE, box, dot, ring, type Fill } from "./shape";

const TRIANGLE = "M10.4 4.9a1.85 1.85 0 0 1 3.2 0l7 12.2a1.85 1.85 0 0 1-1.6 2.8H5a1.85 1.85 0 0 1-1.6-2.8Z";
const OCTAGON = "M9 3.6h6a1.6 1.6 0 0 1 1.1.5l4 4a1.6 1.6 0 0 1 .5 1.1v5.6a1.6 1.6 0 0 1-.5 1.1l-4 4a1.6 1.6 0 0 1-1.1.5H9a1.6 1.6 0 0 1-1.1-.5l-4-4a1.6 1.6 0 0 1-.5-1.1V9.2a1.6 1.6 0 0 1 .5-1.1l4-4A1.6 1.6 0 0 1 9 3.6Z";
const BUBBLE = "M12 3.5a8.5 8.5 0 0 0-7.4 12.7l-.9 3.3a.7.7 0 0 0 .9.9l3.2-1A8.5 8.5 0 1 0 12 3.5Z";
const HOUSE = "M4.5 10.6l6.3-5.5a1.8 1.8 0 0 1 2.4 0l6.3 5.5V18a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z";
const BELL = "M6 10a6 6 0 0 1 12 0v3.2l1.4 2.6a.8.8 0 0 1-.7 1.2H5.3a.8.8 0 0 1-.7-1.2L6 13.2Z";

export const FILLS: Record<string, Fill> = {
  // The round marks.
  CheckCircle: { b: CIRCLE, k: "M8.3 12.3l2.5 2.5 4.9-5.2" },
  WarningCircle: { b: CIRCLE, k: "M12 7.6v5.2", ks: dot(12, 16.1) },
  Info: { b: CIRCLE, k: "M12 11.2v5.2", ks: dot(12, 7.9) },
  XCircle: { b: CIRCLE, k: "M9.1 9.1l5.8 5.8M14.9 9.1l-5.8 5.8" },
  PauseCircle: { b: CIRCLE, k: "M10 9v6M14 9v6" },
  MinusCircle: { b: CIRCLE, k: "M8 12h8" },
  PlusCircle: { b: CIRCLE, k: "M12 8v8M8 12h8" },
  PlayCircle: { b: CIRCLE, ks: "M10 8.3v7.4a.6.6 0 0 0 .9.5l5.7-3.7a.6.6 0 0 0 0-1l-5.7-3.7a.6.6 0 0 0-.9.5Z" },
  StopCircle: { b: CIRCLE, ks: box(8.5, 8.5, 7, 7, 1.8) },
  Prohibit: { b: CIRCLE, k: "M6.8 6.8l10.4 10.4" },
  Question: { b: CIRCLE, k: "M9.5 9.7a2.5 2.5 0 1 1 3.7 2.2c-.8.4-1.2 1-1.2 1.8", ks: dot(12, 16.4) },
  Clock: { b: CIRCLE, k: "M12 7.5V12l3 2" },
  ClockUser: { b: CIRCLE, k: "M12 7.5V12l1.6 1.1", ks: ring(18.2, 18.2, 5.4), o: `${ring(18.2, 16.2, 1.3)}M15.4 21c.4-1.5 1.5-2.3 2.8-2.3s2.4.8 2.8 2.3` },
  Warning: { b: TRIANGLE, k: "M12 9.6v3.9", ks: dot(12, 16.5) },
  WarningOctagon: { b: OCTAGON, k: "M12 8v4.6", ks: dot(12, 15.9) },
  ShieldCheck: { b: SHIELD, k: "M8.8 11.9l2.3 2.3 4.2-4.5" },
  ShieldWarning: { b: SHIELD, k: "M12 8.4v4", ks: dot(12, 15.4) },
  ShieldStar: { b: SHIELD, ks: "M12 7.6l1.3 2.6 2.8.4-2 2 .5 2.8-2.6-1.3-2.6 1.3.5-2.8-2-2 2.8-.4Z" },
  SealCheck: { b: SEAL, k: "M8.8 12.2l2.3 2.3 4.2-4.5" },
  SealWarning: { b: SEAL, k: "M12 8.2v4.2", ks: dot(12, 15.5) },
  CheckSquare: { b: SQUARE, k: "M8.4 12.2l2.5 2.5 4.7-5" },
  Square: { b: box(4, 4, 16, 16, 4.5) },
  DotsThreeOutline: { b: `${box(3, 9.75, 4.5, 4.5, 2.25)}${box(9.75, 9.75, 4.5, 4.5, 2.25)}${box(16.5, 9.75, 4.5, 4.5, 2.25)}` },

  // Things that are on, chosen or playing.
  Play: { b: "M7.5 5.6v12.8a1 1 0 0 0 1.5.9l10.4-6.4a1 1 0 0 0 0-1.8L9 4.7a1 1 0 0 0-1.5.9Z" },
  Stop: { b: box(5.5, 5.5, 13, 13, 3.5) },
  Pause: { b: `${box(6, 4.5, 4, 15, 1.6)}${box(14, 4.5, 4, 15, 1.6)}` },
  Blocks: { b: `${box(3.5, 12.5, 8, 8, 2.6)}${box(12.5, 12.5, 8, 8, 2.6)}${box(8, 3.5, 8, 8, 2.6)}` },
  Cursor: { b: "M5.5 4.6l13.5 5-5.7 2.7-2.7 5.7Z" },
  ChatCircle: { b: BUBBLE },
  ChatCircleText: { b: BUBBLE, k: "M8.5 10.5h7M8.5 14h4.5" },
  PushPin: { b: "M10 4h4v5.2l2.5 3.8h-9L10 9.2Z", o: "M9.5 4h5M12 13v7" },
  PaperPlaneRight: { b: "M4.6 4.8l15.4 6.5a.8.8 0 0 1 0 1.4L4.6 19.2a.6.6 0 0 1-.8-.7L5.5 12 3.8 5.5a.6.6 0 0 1 .8-.7Z", k: "M5.5 12H12" },
  Microphone: { b: box(9, 3, 6, 11, 3), o: "M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" },
  ImageSquare: { b: SQUARE, k: "M4 16l3.9-3.9a1.6 1.6 0 0 1 2.2 0L13 15l1.4-1.4a1.6 1.6 0 0 1 2.2 0L20 17", ks: ring(8.8, 8.8, 1.7) },
  VideoCamera: { b: `${box(2.5, 6.5, 13, 11, 3.5)}M17 10.2l2.8-1.7a.8.8 0 0 1 1.2.7v5.6a.8.8 0 0 1-1.2.7L17 13.8Z` },
  Folder: { b: FOLDER },
  FolderSimple: { b: FOLDER },
  FilmSlate: { b: box(3.5, 9, 17, 10.5, 3), o: "M3.6 8.9l15.2-3.6a.8.8 0 0 1 1 .6l.4 1.7M7.2 8l2-3.2M12.4 6.8l2-3.2" },
  Eye: { b: "M2.8 12c2-3.9 5.3-6 9.2-6s7.2 2.1 9.2 6c-2 3.9-5.3 6-9.2 6s-7.2-2.1-9.2-6Z", ks: ring(12, 12, 2.9) },
  CalendarCheck: { b: box(3.5, 5, 17, 15.5, 4), k: "M9 14.8l2.2 2.2 4-4.2", o: "M8 3v3M16 3v3" },
  HouseSimple: { b: HOUSE },
  House: { b: HOUSE, ks: "M10 20.5v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5Z" },
  Bell: { b: BELL, o: "M10 20a2.2 2.2 0 0 0 4 0" },
  Flag: { b: "M5.5 5.2c2.2-1.3 4.2-.8 6.5 0s4.3 1.3 6.5 0v8.6c-2.2 1.3-4.2.8-6.5 0s-4.3-1.3-6.5 0Z", o: "M5.5 20.5V4.5" },
  LockSimple: { b: box(5, 10, 14, 10.5, 3.5), o: "M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" },
  Moon: { b: "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" },
  Sun: { b: ring(12, 12, 4), o: "M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" },
  User: { b: `${ring(12, 8.5, 3.5)}M5 19.5c.9-3.3 3.7-5.2 7-5.2s6.1 1.9 7 5.2Z` },
  ThumbsUp: { b: "M7.5 10.5l3.8-6.2a2.2 2.2 0 0 1 2.7 2.6l-.7 3.1h4.6a2 2 0 0 1 2 2.4l-1 5.5a2 2 0 0 1-2 1.6H7.5Z", o: "M4.2 11v8" },
};
