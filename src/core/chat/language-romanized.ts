/**
 * Word profiles for languages usually written in their own script, as people type them in English letters (stage 204, ADR 0221):
 * Sinhala ("Singlish"), Hindi and Urdu ("Hinglish", Roman Urdu), Tamil ("Tanglish") and others. Common words only, in the
 * spellings people use most; romanized spelling varies a lot, so a reading is a hint for the model, never the final word.
 */
import type { Profile } from "./language-profiles";

export const ROMANIZED_PROFILES: Record<string, Profile> = {};

ROMANIZED_PROFILES.si = {
  words:
    "mata mage oya oyaa oyage oyata mama api apita apage eka ekak eke ekata meka mekata oka eya eyala kohomada kohoma mokada mokadda mokakda monawada mona mokak karanna kiyanna kiyala kiwwa puluwan puluwanda one:0.4 oney ona onna na:0.4 nane nehe naha nathi hari hondai hondin honda innawa inne inna yanna yanawa yana yanne yamu enna enawa ena ganna gannawa ganne gannam hadanna hadaganna hadala hadanne wenne wena wela wenawa nisa nam:0.4 neda nedda thiyenawa tiyenawa thiyena tiyena denna dennam balanna balala karala karanne karanawa ikmanata godak tikak tikka wage:0.5 ehema mehema ehenam machan malli akka ayya heta ada:0.4 iye dan:0.3 passe kalin gedara giya awa awe liyanna igena igenaganna ekka samaga wada wadak wade kawda kauda koheda aththa bae epa kanna bonna dawase ithin kiyannako karannako denawa dunna dunne thama tawa thawa wenuwen",
  shapes: [/[a-z]{2,}(?:nna|nnam|nnako|nawa|anne|enne|inne|gannam)$/, /[a-z]{3,}(?:mada|kada|neda|ekak|ekata|walin)$/],
};

ROMANIZED_PROFILES["hi|ur"] = {
  words:
    "main:0.5 mai mein me:0.3 mujhe mujhko mera meri mere tum tu:0.4 tumhe tumhara tumhari tera teri tere aap aapka aapki aapke apka apki apna apni hum humein hame hamara hamari woh wo yeh ye:0.5 kya kyun kyu kyon kaise kaisa kaisi kahan kab kaun kitna kitne kitni hai hain ho:0.5 hoon hun hu:0.3 tha thi the:0.25 raha rahi rahe rha kar:0.5 karo karna karni karne karte karta karti kiya kiye kuch sab bahut bohot bahot bhi nahi nahin nhi haan accha acha achha theek thik ek:0.5 aur ya:0.3 lekin magar par:0.4 pe se:0.4 ko:0.5 ka:0.4 ki:0.5 ke:0.5 ne:0.25 to:0.2 toh ab abhi phir fir chahiye chahta chahti chahte sakta sakti sakte banana:0.3 banani banane bana sikhao sikhaiye samajhsamjha samjhao samajhna batao bataiye bolo dekho jao aao chalo yaar bhai dost kal aaj din raat ghar kaam paisa log sikhna seekhna sikhana padhna likhna matlab shukriya dhanyavad janab zaroor zarur bilkul kyunki kyunke wala wali wale gaya gayi gaye hua hui hue diya liya karunga karungi hoga hogi",
};

ROMANIZED_PROFILES.ta = {
  words:
    "naan nan:0.3 enakku unakku ungalukku neenga nee:0.4 avan aval avanga avar enna:0.5 epdi eppadi enga:0.4 engae eppo yaen ennoda unnoda illa:0.5 illai irukku iruku irukken irukeenga iruka irukka venum vendam vendum vanakkam nandri romba konjam seri aama theriyum theriyathu teriyum panna pannu pannunga panren poren pora vaa vaanga ponga sollu sollunga solren paaru paarunga saapdu oru:0.6 rendu moonu intha antha idhu adhu ithu athu ingae angae inga anga naalaikku nethu inniku innaikku pannalam pogalam varen vandhen ponen",
  shapes: [/[a-z]{2,}(?:kku|ngal|ngala|eenga|aanga|kkum|dhu|ichu|achu|kkanum)$/],
};

ROMANIZED_PROFILES.te = {
  words:
    "nenu naaku naku neeku meeku nuvvu meeru vaadu aame emi enti ekkada eppudu enduku ledu undi unnadi unnanu unnaru kaavali kavali cheyyali cheyyandi cheyyi cheppu cheppandi chesanu chestunnanu vellali vastanu bagunnava bagunnara bagundi chala:0.5 konchem avunu kaadu ee:0.3 oka inka ippudu appudu ikkada akkada andi:0.5 pani:0.3 telusu teliyadu matladu matladandi",
};

ROMANIZED_PROFILES.bn = {
  words:
    "ami:0.6 amar amake amra tumi tomar tomake tomra apni apnar apnake tar ora keno kothay kemon kobe kono ache achhe achi achho achen hobe hoy hoyeche korbo korchi korte kori:0.4 koro korun bolo:0.3 bolchi bolun jabo jacchi khabo bhalo khub onek ektu ekta ei:0.5 ota eta kintu tobe abar shob dhonnobad lagbe parbo pari:0.3",
};

ROMANIZED_PROFILES.ne = {
  words:
    "ma:0.3 malai mero timi timro timilai tapai tapain tapaiko hami hamro uni yo:0.4 tyo kina kaha kasari kati kun cha chha chhu chau chhau chaina chhaina hoina garna garnu gara garchu gardai garyo garnuhos bhayo bhanna bhannu bhanus janu aaunu sakchu sakdina parcha parchha ramro ramrari dherai ani tara:0.3 sanga lai maa namaste huncha hunchha thiyo",
};

ROMANIZED_PROFILES.pa = {
  words:
    "mainu menu:0.3 tainu tenu tuhanu tusi tussi assi sanu ohnu kiven kive kithe kitthe kado haanji changa changi vadiya vadhiya paaji praa veer kardi karda karde aaja sada sadda tuhada tuhadi ehna ohna gal galla kuj hunda hundi lagda lagdi",
};

ROMANIZED_PROFILES.gu = {
  words:
    "hu:0.3 mane mara mari maru tame tamne tamaru tamara tane ame amne apne shu:0.3 kem kyan kyare che chhe chu:0.3 chhu cho:0.4 chho nathi hatu hati hata karvu karvanu javu aavu saru majama majaama bahu:0.4 thodu ane mate aabhar ghanu badhu",
};

ROMANIZED_PROFILES.mr = {
  words:
    "mala maza majha mazi majhi mazya tula tuza tujha tumhi tumhala aamhi amhi aapan kay kaay kasa kashi kase kuthe kevha aahe ahe aahes aahet aahot naahi karayche karaycha karto saang jaycha yeto yete khup thoda madhe sathi dhanyavad mhanje zala jhala zali",
};

/** Arabic in English letters ("Arabizi"): digits stand for sounds English letters lack (3, 7, 2), read in language.ts. */
ROMANIZED_PROFILES.ar = {
  words:
    "ana:0.6 enta enti inta inti howa huwa heya hiya ehna ahna entom homma mesh:0.3 msh mish mafi mafish fi:0.3 fe:0.3 min:0.3 mn:0.3 ala:0.4 eh:0.3 ezay izzay kifak kifik keef kaif shu:0.5 shou leh lesh laish yalla habibi akid akeed tayeb tamam kwayes kteer ktir bas:0.3 el:0.3 il:0.2 aw:0.3 da:0.2 di:0.2 dah deh keda kda kaman lazem lazim bidi biddi ayez aiz momken mumkin hada hadi haida hayda aywa aiwa shukran shokran afwan ahlan marhaba sabah kheir khair yani khalas bukra bokra 3ala ma3a ya3ni 5alas 2ana",
};

ROMANIZED_PROFILES.fa = {
  words:
    "man:0.5 shoma anha chi:0.3 chera koja chetor kheili kheyli khoob khub mamnoon mamnun khodahafez hast hastam hasti nist nistam budam mikham mikhay mikhad migam miram miam mikonam mikoni kardam konam bekonam baraye az:0.3 dar:0.3 va:0.3 yek chand dige hamin alan farda diruz emruz bayad mitoonam mitunam",
  shapes: [/^mi(?:kh|sh|[kgrzdtbfnsyaou])[a-z]*(?:am|im|id|and|ad)$/],
};

ROMANIZED_PROFILES.ru = {
  words:
    "ya:0.3 ty menya tebya mne tebe ona:0.2 vy oni eto:0.8 chto shto kak:0.5 gde kogda pochemu privet poka spasibo pozhaluysta pozhaluista net:0.2 khorosho horosho ochen dela zovut ponimayu znayu mozhno nado nuzhno budu byl bylo uzhe eshche esche tozhe tolko vse vsyo segodnya zavtra vchera seychas sejchas zdes kto chem dlya ili ne:0.2 iz:0.2 ot:0.2 za:0.2 kakoy kakaya kakie mozhesh mogu hochu hochesh davai znachit ladno nichego kotoryy kotoraya pomoch pomogi rabotaet",
  shapes: [/[a-z]{3,}(?:tsya|ogo|yye|iye|yut|yat|aet|ayu|uyu)$/],
};

/** Chinese in Pinyin: language.ts also checks whether the other words split into Pinyin syllables. */
ROMANIZED_PROFILES.zh = {
  words:
    "wo:0.7 ni:0.5 ta:0.2 women nimen tamen shi:0.5 bu:0.5 mei:0.4 you:0.1 de:0.15 le:0.15 ma:0.2 ne:0.15 ba:0.2 hen:0.3 zai:0.6 ye:0.15 dou:0.5 hao:0.7 xie:0.5 xiexie nihao shenme zenme weishenme nali zhe:0.7 zhege nage yao:0.5 xiang neng:0.7 keyi hui:0.4 qu:0.4 lai:0.4 shuo zuo:0.5 gei dui:0.5 zhidao xihuan pengyou laoshi zhongguo zhongwen hanyu jintian mingtian zuotian xianzai yixia yidian yige mingzi renshi xuexi gongzuo meiyou haode duibuqi zaijian qing:0.5 jiu:0.5 dian:0.5 nian:0.5 zhen:0.5 zhi:0.5 yinggai xuyao bangzhu",
};

ROMANIZED_PROFILES.ja = {
  words:
    "watashi boku:0.5 anata kimi:0.3 kanojo kore sore kono sono:0.3 ano:0.3 koko soko asoko nani dare doko itsu naze doushite ikura desu deshita masu mashita masen imasu arimasu janai dewa wa:0.3 ga:0.3 wo:0.1 ni:0.15 mo:0.15 ka:0.2 ne:0.1 yo:0.15 kara made:0.15 kedo dakara sugoi kawaii iie arigatou arigato gozaimasu sumimasen gomen gomennasai onegai onegaishimasu kudasai ohayou konnichiwa konbanwa sayonara oyasumi totemo chotto motto zenbu nihongo nihon eigo shite suru shimasu ikimasu kimasu tabemasu mimasu wakaru wakarimasu wakaranai shitte kyou ashita kinou tomodachi sensei gakkou shigoto daijoubu",
  shapes: [/[a-z]{2,}(?:masu|mashita|masen|mashou|desu|deshita|kudasai|nakatta)$/],
};

ROMANIZED_PROFILES.ko = {
  words:
    "annyeong annyeonghaseyo gamsahamnida gomawo gomawoyo saranghae saranghaeyo aniyo aniya jeo:0.5 jeoneun naneun neo neoneun uri:0.5 dangsin geu:0.6 mwo mwoya mwoyeyo mueot nugu eodi eonje wae:0.6 eotteoke eottae eolma isseoyo eopseoyo haeyo hamnida juseyo jom:0.5 jal:0.5 jeongmal neomu hanguk hangugeo ireum imnida haseyo gayo meogeoyo gongbu chingu oneul naeil eoje jigeum joayo",
  shapes: [/[a-z]{2,}(?:eyo|seyo|nida|mnida|neun|eun|reul|eul|ieyo|yeyo|haeyo)$/],
};
