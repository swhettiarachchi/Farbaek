/**
 * Telling a question from a request to act on the person's computer (stage 206, ADR 0223). Framework-free, no model call.
 *
 * Farbaek Chat answers; it can't touch anyone's computer. The desktop app can, within limits it enforces itself: it works on a
 * copy of a Farbaek project, and every command waits for the person's approval there. Nothing in Farbaek can yet see a screen,
 * move a mouse, type, or drive a browser or another app. So when a message asks for something to be done on the computer
 * ("open my browser", "create a folder on my desktop"), the model is told exactly that, so it never says it did the thing: it
 * says what it can't do and helps the person do it themselves. "How do I create a folder?" is a question, and is answered.
 *
 * Reading a request where there is none is the worse mistake: the answer would open by refusing something nobody asked for.
 * So every pattern needs the order at the start of the message and either the person's own machine in so many words ("my
 * desktop", "on my PC") or a thing that only exists on a computer (a browser by name, a named desktop app, the terminal). "Write
 * a press release for me", "Update the app to use React 19" and "Use the browser's localStorage" are none of these.
 *
 * The list below is the one place that says what the computer side can and can't do. It is checked in tests against what the
 * model is told, so the two can't drift apart.
 */

export const COMPUTER_CAPABILITIES = [
  { id: "project-files", does: "read and change the files of a Farbaek project copy on the computer", available: true },
  { id: "project-commands", does: "run commands in that project copy, each one only after the person approves it there", available: true },
  { id: "files", does: "create, move or delete files and folders elsewhere on the computer", available: false },
  { id: "terminal", does: "run commands outside a project copy", available: false },
  { id: "browser", does: "open or drive a web browser", available: false },
  { id: "apps", does: "open, close, install or drive other apps, or change system settings", available: false },
  { id: "screen", does: "see the screen or take a screenshot", available: false },
  { id: "input", does: "move the mouse, click or type", available: false },
] as const;

export type ComputerCapability = (typeof COMPUTER_CAPABILITIES)[number]["id"];

export interface ActionReading {
  kind: "computer";
  /** What the request would need, most specific first. */
  wants: ComputerCapability[];
}

/** A question about doing something, not a request to do it. */
const ASKING_HOW =
  /^(?:please |pls )?(?:how\b|how's\b|what(?:'s| is| are)\b|why\b|explain\b|tell me (?:how|what|why)\b|show me how\b|teach me\b|steps? (?:to|for)\b|guide (?:to|for|me)\b|is (?:it|there)\b|can (?:i|we)\b|should i\b|what happens\b|write\b|draft\b|give me\b)/i;
const ASKING_HOW_SI = /(?<![\p{L}\p{M}])(?:kohomada|kohomda|kohomadha|kohmd|karanne kohomada|hadanne kohomada|කොහොමද|කරන්නේ කොහොමද|හදන්නේ කොහොමද)(?![\p{L}\p{M}])/iu;

/** The person's own machine, said as theirs. */
const MINE = "(?:my (?:own )?(?:computer|pc|laptop|mac|macbook|desktop)|this (?:computer|pc|laptop|mac|macbook))";
/** The start of an order: nothing before it but a greeting and a politeness. */
const LEAD = "^(?:hey |hi |ok |okay )?(?:please |pls |can you |can u |could you |could u |would you |will you |i want you to |i need you to |go ahead and |just )*";
/** "Do it", in Sinhala typed in English letters (with the fast spellings) and in Sinhala. */
const KARANNA = "(?:karanna|krnna|krnn|kranna|karapan|karala|karannako|කරන්න)";
/** Apps that live on a computer, by name: a generic "app" or "application" is usually someone's own product. */
const APPS = "notepad|calculator|file explorer|finder|control panel|task manager|spotify|photoshop|vs ?code|visual studio code|whatsapp|zoom|microsoft teams|slack|discord|vlc|paint|outlook|powerpoint|ms word|microsoft word|microsoft excel";
const BROWSERS = "browser|chrome|google chrome|firefox|safari|microsoft edge|edge browser|brave browser|opera";

const PATTERNS: { wants: ComputerCapability; re: RegExp }[] = [
  { wants: "browser", re: new RegExp(`${LEAD}(?:open|launch|start|bring up) (?:up )?(?:my |the |a |a new )?(?:web )?(?:${BROWSERS})\\b(?!'s| extension| console| dev ?tools| api| cache| settings)`, "i") },
  // An address has full stops in it ("go to gmail.com in my browser"), so only a question or exclamation mark ends the reach.
  { wants: "browser", re: new RegExp(`${LEAD}(?:open|visit|go to|navigate to|log ?in to|sign in to)\\b[^?!\\n]{1,80}\\b(?:in|on|with|using) my (?:${BROWSERS})\\b`, "i") },
  { wants: "browser", re: new RegExp(`(?<![\\p{L}\\p{M}])(?:browser|chrome|firefox|safari) (?:eka|ekak|එක|එකක්) (?:open|on|start|ඕපන්) ${KARANNA}`, "iu") },
  { wants: "screen", re: new RegExp(`${LEAD}(?:take|grab|capture) (?:a |me a )?screenshot\\b(?! of (?:the|a|an|this|that|each|every) )|${LEAD}(?:look at|see|watch|read|check) (?:what(?:'s| is) on )?my screen\\b`, "i") },
  { wants: "screen", re: /(?<![\p{L}\p{M}])screenshot (?:ekak|eka) (?:ganna|gannako)(?![\p{L}\p{M}])|screenshot එකක් ගන්න/iu },
  { wants: "input", re: new RegExp(`${LEAD}(?:control|take control of|take over|operate|drive) ${MINE}\\b|${LEAD}(?:control|move|use) my (?:mouse|keyboard|cursor)\\b|${LEAD}(?:click|double[- ]click|right[- ]click|scroll|type|press)\\b[^?!\\n]{0,60}\\bon my (?:screen|computer|pc|laptop|mac|desktop)\\b`, "i") },
  { wants: "input", re: new RegExp(`(?<![\\p{L}\\p{M}])(?:mage|මගේ) (?:computer|pc|laptop|desktop) (?:eka|ek|එක) control ${KARANNA}`, "iu") },
  // A file name has a full stop in it ("rename report.docx on my desktop"): only a question or exclamation mark ends the reach.
  { wants: "files", re: new RegExp(`${LEAD}(?:create|make|add|delete|remove|rename|move|copy|organi[sz]e|sort|clean up|tidy|empty|zip|unzip|back ?up)\\b[^?!\\n]{0,100}\\b(?:on|in|from|to|inside) (?:${MINE}|my (?:downloads?|documents|pictures|recycle bin|trash|[a-z] drive|hard drive))\\b`, "i") },
  { wants: "files", re: new RegExp(`(?<![\\p{L}\\p{M}])(?:desktop|computer|pc|laptop|downloads|documents) (?:folder )?(?:eke|eken|ekata|wala|walin|එකේ|එකෙන්|එකට)(?![\\p{L}\\p{M}])[^?!\\n]{0,80}(?:hadanna|hadapan|makanna|මකන්න|හදන්න|(?:delete|rename|move|copy) ${KARANNA})`, "iu") },
  { wants: "terminal", re: new RegExp(`${LEAD}(?:run|execute)\\b[^?!\\n]{0,80}\\b(?:on|in) (?:${MINE}|my (?:terminal|command prompt|powershell|shell|command line|machine))\\b|${LEAD}(?:open|launch|start) (?:my |the |a )?(?:terminal|command prompt|powershell|cmd)\\b(?! command| script)`, "i") },
  { wants: "apps", re: new RegExp(`${LEAD}(?:open|launch|close|quit) (?:up )?(?:my |the )?(?:${APPS})\\b(?! file| document| sheet| spreadsheet| formula| api)`, "i") },
  // "Open the application and do this": the owner's own example of a request for app and screen control.
  { wants: "apps", re: new RegExp(`${LEAD}(?:open|launch) (?:up )?(?:the|my|this|that) (?:app|application|program)\\b(?! store| code| file| folder|'s)`, "i") },
  { wants: "apps", re: new RegExp(`${LEAD}(?:install|uninstall)\\b[^?!\\n]{1,60}\\b(?:on|from) ${MINE}\\b|${LEAD}(?:shut ?down|restart|reboot|lock|log ?off|put to sleep|turn off) ${MINE}\\b|${LEAD}change my (?:wallpaper|desktop background|screen brightness)\\b`, "i") },
  { wants: "apps", re: new RegExp(`(?<![\\p{L}\\p{M}])(?:${APPS}|excel|word|chrome) (?:eka|ekak|එක|එකක්) (?:(?:open|on|start|close|ඕපන්) ${KARANNA}|arala|aranna|arapan|ඇරලා|අරින්න)`, "iu") },
  { wants: "apps", re: new RegExp(`(?<![\\p{L}\\p{M}])(?:mage |මගේ )?(?:computer|pc|laptop) (?:eka|ek|එක) (?:shutdown|shut down|restart|reboot|off|lock) ${KARANNA}`, "iu") },
];

/** A file job said as an order, the kind of thing it is about, and a place on a computer it is taken from or put into: all three make a request. */
const FILE_JOB = new RegExp(`${LEAD}(?:create|make|delete|remove|rename|move|copy|organi[sz]e|sort|clean up|tidy|empty|zip|unzip|back ?up)\\b`, "i");
const FILE_THING = /\b(?:files?|folders?|director(?:y|ies)|pdfs?|photos?|shortcuts?|screenshots?|\w{1,60}\.(?:docx?|xlsx?|pptx?|pdf|txt|csv|png|jpe?g|zip))\b/i;
const FILE_PLACE = /\b(?:from|in|into|to|on|inside) (?:my |the )?(?:desktop|downloads|documents|pictures|recycle bin|trash|[a-z] drive|hard drive|usb(?: stick| drive)?|external drive)\b/i;

/** Reads a message for a request to act on the person's computer. Null for a question, a conversation or anything else. */
export function readAction(text: string): ActionReading | null {
  const message = text.normalize("NFC").trim().slice(0, 600);
  if (!message || /```|~~~/.test(message)) return null;
  if (ASKING_HOW.test(message) || ASKING_HOW_SI.test(message)) return null;
  const wants = [...new Set(PATTERNS.filter((p) => p.re.test(message)).map((p) => p.wants))];
  if (!wants.includes("files") && FILE_JOB.test(message) && FILE_THING.test(message) && FILE_PLACE.test(message)) wants.push("files");
  return wants.length > 0 ? { kind: "computer", wants } : null;
}

const NOTE = "A note from Farbaek, not from the person:";

/**
 * What the model is told beside a request to act on the computer. Fixed sentences and the list above: never the person's words.
 */
export function computerNote(reading: ActionReading): string {
  const cannot = COMPUTER_CAPABILITIES.filter((c) => !c.available);
  const can = COMPUTER_CAPABILITIES.filter((c) => c.available);
  const asked = cannot.filter((c) => reading.wants.includes(c.id));
  return [
    `${NOTE} this message reads as asking for something to be done on the person's own computer. From this chat you can't act on their computer, and you must never say or imply that you opened, created, deleted, clicked, typed, installed or ran anything. If the message is in fact about something else, answer it as usual and leave this note aside.`,
    `What exists today: the Farbaek desktop app can ${can.map((c) => c.does).join(", and ")}. Nothing in Farbaek can yet ${cannot.map((c) => c.does).join("; ")}.${asked.length > 0 ? ` This request needs it to ${asked.map((c) => c.does).join(", and to ")}, which isn't possible yet.` : ""}`,
    "Say in one or two plain sentences that you can't do this from here, then help them do it themselves: the exact steps or commands for their system (ask which system only if the steps differ and it isn't clear). Mention the desktop app (Desktop app, in Farbaek's menu) only when what they want is work on a project's code or files. Don't promise that this is coming.",
  ].join("\n");
}
