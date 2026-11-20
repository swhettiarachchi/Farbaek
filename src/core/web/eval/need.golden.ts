/**
 * Labelled messages for the reading of whether a message needs the live web (stage 206, ADR 0223). Written for this test, in
 * the way people type; none are taken from a dataset. Labels:
 * - "none": nothing to look up (a greeting, creative writing, the person's own text, a sum);
 * - "web": needs current or outside facts, and its own words say so;
 * - "deep": a research task;
 * - "open": the words don't say either way, so the planner model must be asked (reading it as "none" would be a mistake).
 */
export type NeedLabel = "none" | "web" | "deep" | "open";
export type NeedCase = readonly [text: string, label: NeedLabel];

export const NEED_ENGLISH: NeedCase[] = [
  ["hi", "none"],
  ["Hello there!", "none"],
  ["good morning", "none"],
  ["how are you?", "none"],
  ["who are you?", "none"],
  ["what can you do?", "none"],
  ["Write a poem about the sea", "none"],
  ["Tell me a joke", "none"],
  ["Write a short story about a cat who learns to fly", "none"],
  ["Can you write me a funny limerick about Mondays", "none"],
  ["Translate 'good morning' to French", "none"],
  ["Proofread this: Their going to the park tomorow.", "none"],
  ["Rewrite this to be more formal: hey, can u send the file", "none"],
  ["Summarize this: The quick brown fox jumps over the lazy dog and then sleeps.", "none"],
  ["12 * 7 + 3", "none"],
  ["what is 144 / 12?", "none"],
  ["Fix this:\n```js\nconst a = [1, 2, 3\n```", "none"],
  ["Make this shorter: We are writing to inform you that the meeting has been moved to today.", "none"],
  ["What's the latest news on AI?", "web"],
  ["Bitcoin price today", "web"],
  ["Who won the match last night?", "web"],
  ["weather in Colombo", "web"],
  ["What is the current exchange rate for USD to LKR?", "web"],
  ["Is GitHub down?", "web"],
  ["When is the next iPhone release date?", "web"],
  ["Who is the president of Sri Lanka?", "web"],
  ["Latest version of Node.js", "web"],
  ["Search the web for the best budget laptops", "web"],
  ["Look up the population of Kandy online", "web"],
  ["Can you verify whether the Eiffel Tower is 330 m tall", "web"],
  ["best phones 2026", "web"],
  ["what happened in the stock market today", "web"],
  ["new features in Python this year", "web"],
  ["How much does a Tesla Model 3 cost", "web"],
  ["Find sources on microplastics in drinking water, with citations", "web"],
  ["Google this for me: opening hours of the national museum", "web"],
  ["Research the latest developments in artificial intelligence across the world.", "deep"],
  ["Do a deep dive into the EV battery market", "deep"],
  ["Compare GPT, Claude and Gemini across price, speed and quality", "deep"],
  ["Write a comprehensive report on renewable energy in South Asia", "deep"],
  ["Investigate the causes of the 2022 Sri Lankan economic crisis", "deep"],
  ["I need a literature review on transformer efficiency", "deep"],
  ["market analysis of the electric scooter industry", "deep"],
  ["Explain how AI agents work.", "open"],
  ["What is photosynthesis?", "open"],
  ["How do I center a div in CSS?", "open"],
  ["Compare GPT and Claude.", "open"],
  ["What's the capital of France?", "open"],
  ["Create a presentation about our product", "open"],
  ["Give me a workout plan for beginners", "open"],
];

/** One question about today's news or a price in each of the other languages Chat is tested in, and a few greetings. */
export const NEED_WORLD: NeedCase[] = [
  ["¿Cuáles son las noticias de hoy?", "web"],
  ["Quelles sont les dernières actualités sur l'IA ?", "web"],
  ["Was sind die neuesten Nachrichten heute?", "web"],
  ["Qual é o preço do bitcoin hoje?", "web"],
  ["Quali sono le ultime notizie?", "web"],
  ["Wat is het laatste nieuws vandaag?", "web"],
  ["Какие сегодня новости?", "web"],
  ["ما هي آخر الأخبار اليوم؟", "web"],
  ["आज की ताज़ा खबर क्या है?", "web"],
  ["இன்று செய்திகள் என்ன?", "web"],
  ["今日のニュースは何ですか？", "web"],
  ["今天有什么新闻？", "web"],
  ["오늘 뉴스 알려줘", "web"],
  ["aaj ki taza khabar kya hai", "web"],
  ["innaiku news enna", "web"],
  ["hola", "none"],
  ["bonjour", "none"],
  ["namaste", "none"],
  ["vanakkam", "none"],
  ["Erkläre mir, wie ein Motor funktioniert", "open"],
  ["Explique-moi la photosynthèse", "open"],
];
