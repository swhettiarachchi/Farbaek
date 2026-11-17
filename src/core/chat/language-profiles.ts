/**
 * Word profiles for reading languages written in Latin letters (stage 204, ADR 0221). Each language lists its most common short
 * words (function words, pronouns, everyday verbs), the letters with diacritics it uses, and a few word shapes. "word:0.5" gives a
 * word less weight, for words that are also common in another language. Lists of common words, not example sentences: the
 * labelled examples the reader is measured on (language.golden.ts) were written separately.
 *
 * `bare: false` keeps a language's words from also matching when typed without their diacritics (Vietnamese without its marks
 * collides with too many English words).
 */

export interface Profile {
  words: string;
  letters?: string;
  shapes?: RegExp[];
  bare?: boolean;
}

/** Languages written in the Latin alphabet as normal. */
export const LATIN_PROFILES: Readonly<Record<string, Profile>> = {
  en: {
    words:
      "the a an is are was were be been being am i you he she it we they me my your yours his her its our their them this that these those what which who whom whose how why when where can could would should will shall may might must do does did done have has had not no:0.5 yes and or but if of to in on at for with from by about as into than then so too also very just only even still please thanks thank there here some any all more most much many other each every both such own same again ever never always now today tomorrow yesterday need want help make get know think like good best new use using way start tell give show write explain something anything everything nothing because while after before i'm it's don't can't won't what's that's there's i've i'll i'd you're let's doesn't isn't aren't didn't im dont cant wont whats thats youre lets doesnt isnt sure really per via vs pro",
  },
  de: {
    words:
      "der die das den dem des ein eine einen einem einer eines und oder aber ist sind war waren bin bist hat habe haben hast hatte wird werden wurde kann kannst können konnte muss musst müssen will:0.5 willst wollen möchte möchtest ich du er sie es wir ihr mich mir dich dir uns euch ihm ihn ihnen mein meine meinen dein deine sein seine nicht kein keine keinen ja nein auch noch schon nur sehr mit von zu zum zur auf für über unter bei nach aus wie was wer wo warum wann welche welcher welches dass wenn weil ob bitte danke gut heute morgen gestern hier dort jetzt mal doch etwas alles viel mehr gibt machen mache macht geht gehen kommt wissen weiß man im ins vom beim diese dieser dieses diesen gerne gern",
    letters: "äöüß",
  },
  fr: {
    words:
      "le la les un une des du de et ou mais est sont suis es êtes sommes ai as avons avez ont être avoir je tu il elle nous vous ils elles on moi toi lui leur mon ma mes ton ta tes son sa ses notre votre nos vos ce cette ces cet qui que quoi quel quelle quels comment pourquoi quand où pas ne plus très bien avec pour dans sur sous chez par en au aux y si oui non merci bonjour peux peut pouvez veux veut voulez faire fait fais comprends comprend sais sait c'est j'ai qu'est ça aussi encore déjà toujours rien tout tous toute beaucoup peu parce aujourd'hui demain hier aider aide s'il plaît",
    letters: "àâæçéèêëîïôœùûüÿ",
  },
  es: {
    words:
      "el la los las un una unos unas y o pero es son soy eres está están estoy estás ser estar hay tengo tienes tiene tenemos yo tú él ella nosotros vosotros ustedes usted me te se mi mis tu tus su sus nos que qué quién cómo como por para porque cuándo cuando dónde donde cuál no sí muy más con sin en de del al lo le les este esta esto ese esa eso puedo puedes puede podemos quiero quieres quiere necesito hacer hago gracias hola bien también ya todo nada algo aquí hoy mañana ayer ahora sobre entre hasta desde mucho poco ayuda ayudar",
    letters: "áéíñóúü¿¡",
  },
  pt: {
    words:
      "o a os as um uma uns umas e ou mas é são sou está estão estou ser estar tem tenho temos há eu você vocês ele ela nós eles elas me te se meu minha meus minhas seu sua seus suas que quem como porque por para pra quando onde qual não sim muito mais com sem em no na nos nas do da dos das ao aos isso isto este esta esse essa posso pode podes podemos quero quer preciso fazer obrigado obrigada olá oi bem também já tudo nada algo aqui hoje amanhã ontem agora sobre até desde ajuda ajudar vou vai sei",
    letters: "áâãàçéêíóôõú",
  },
  it: {
    words:
      "il lo la i gli le un uno una e o ma è sono sei siamo siete essere ho hai ha abbiamo avete hanno io tu lui lei noi voi loro mi ti ci vi si mio mia miei mie tuo tua suo sua che chi cosa come perché quando dove quale non sì molto più con senza in di da del della dei delle al alla nel nella sul sulla per:0.5 tra fra questo questa quello quella posso puoi può voglio vuoi fare faccio grazie ciao buongiorno bene anche già tutto niente qualcosa qui oggi domani ieri adesso ora sempre ancora aiuto aiutare vado andare",
    letters: "àèéìíîòóùú",
  },
  nl: {
    words:
      "de het een en of maar is zijn ben bent was waren heb hebt heeft hebben ik jij je u hij zij ze wij we jullie mij me mijn jouw jou uw haar ons onze niet geen ja nee ook nog al wel heel erg met van voor op in aan bij naar uit over door om te wat wie waar waarom wanneer hoe welke dat die dit deze als omdat kan kun kunt kunnen moet moeten wil wilt willen doen weet weten dank bedankt alstublieft alsjeblieft goed vandaag morgen gisteren hier daar nu iets alles veel meer er zo dan toch even graag",
  },
  ro: {
    words:
      "și sau dar este e sunt ești suntem a al ai ale am are au avem aveți eu tu el ea noi voi ei ele mă mi te ți îl o îi le ne meu mea mei tău ta său nostru noastră că ce cine cum de la în pe cu din pentru despre fără prin până care când unde nu da foarte mai un unei unui ceva nimic tot toate acest această acum azi astăzi mâine ieri aici acolo poți poate pot vreau vrei trebuie fac face faci mulțumesc mersi bună bine ajută ajuți merg mergem să",
    letters: "ăâîșşțţ",
  },
  pl: {
    words:
      "i w z na do nie się to jest są jestem jesteś ja ty on ona my wy oni mnie mi ci go jej mój moja twój twoja że co kto jak dlaczego kiedy gdzie który która czy tak bardzo jeszcze już tylko też także ale lub albo a o od po przez dla przy za pod nad bez może możesz mogę chcę chcesz mam masz ma mamy proszę dziękuję dzięki dobrze dzisiaj dziś jutro wczoraj tutaj teraz coś wszystko nic ten ta te tego tym pomóc pomoc",
    letters: "ąćęłńóśźż",
  },
  cs: {
    words:
      "a i v ve z ze na do ne se to je jsou jsem jsi být já ty on ona my vy oni mě mi tě ti můj moje tvůj že co kdo jak proč kdy kde který která jestli ano velmi moc ještě už jen také taky ale nebo o od po pro:0.4 při za pod nad bez může můžeš mohu můžu chci chceš mám máš má máme prosím děkuji díky dobře dnes zítra včera tady teď něco všechno nic ten ta tento tato",
    letters: "áčďéěíňóřšťúůýž",
  },
  tr: {
    words:
      "ve veya ama bir bu şu o ben sen biz siz onlar beni bana seni sana benim senin ne kim nasıl neden niye nerede hangi mi mı mu mü değil evet hayır çok daha en ile için gibi kadar var yok olarak olan oldu olur ise da de ki bugün yarın dün burada şimdi şey her hiç lütfen teşekkür teşekkürler merhaba iyi güzel istiyorum yapmak misin musun mısın müsün nasılsın",
    letters: "çğıöşü",
    shapes: [/[a-zçğıöşü]{2,}(?:yor|yorum|yorsun|iyor|ıyor|uyor|üyor)$/],
  },
  sv: {
    words:
      "och att det som en ett är var har hade jag du han hon vi ni de dem mig mej dig dej oss min mitt mina din ditt sin inte ja nej också med på för av till från om men eller så vad vem hur varför när vilken kan kunna vill ska skall måste göra gör vet tack snälla bra idag imorgon igår här där nu något allt mycket mer",
    letters: "åäö",
  },
  "da|no": {
    words:
      "og at det som en et er var har havde hadde jeg du han hun vi dere de dem meg mig deg dig oss os min mitt mine din ditt ikke ja nei nej også med på for af av til fra om men eller så hvad hva hvem hvordan hvorfor når hvor hvilken kan kunne vil skal må gøre gjøre gør gjør ved vet tak takk godt bra her der nå nu noget noe alt meget mye mer mere",
    letters: "æøå",
  },
  fi: {
    words:
      "ja on ei en et se että mutta tai kun jos minä mä sinä sä hän me te he minun sinun mikä mitä kuka miten miksi milloin missä voi voin voit voitko haluan haluat haluaisin olen olet olla oli ovat myös vielä jo vain hyvin kiitos hyvä tänään huomenna eilen täällä nyt jotain kaikki paljon enemmän tämä tuo kanssa ilman",
    letters: "äö",
    shapes: [/[a-zäö]{3,}(?:ssa|ssä|sta|stä|lla|llä|lta|ltä|ksi)$/],
  },
  hu: {
    words:
      "a az és vagy de hogy nem igen is egy ez én te ő mi ti ők engem téged nekem neked mit ki hogyan miért mikor hol melyik van vagyok vannak volt lesz nagyon már még csak meg el fel le be szeretnék szeretném szeretnéd tudok tudsz tud köszönöm köszi kérem kérlek jó ma holnap tegnap itt most valami minden sok több ezt azt nincs kell",
    letters: "áéíóöőúüű",
  },
  "bs|hr|sr": {
    words:
      "i je su sam si smo ste biti ja ti on ona mi vi oni me te moj moja tvoj da ne što šta tko ko kako zašto kada kad gdje gde koji koja li vrlo jako još već samo također ali ili a u na za od do iz s sa o po pri bez može možeš mogu želim hoću imam imaš ima molim hvala dobro danas sutra jučer juče ovdje ovde sada sad nešto sve ništa puno mnogo ovo",
    letters: "čćđšž",
  },
  "id|ms": {
    words:
      "saya aku kamu anda kau dia kami kita mereka ini itu yang dan atau tetapi tapi di ke dari untuk dengan pada dalam ada tidak tak bukan ya apa siapa bagaimana gimana kenapa mengapa kapan bila mana bisa boleh dapat mau ingin nak perlu harus sudah udah belum akan sedang lagi juga sangat banget sekali terima kasih tolong baik bagus hari besok kemarin sini sekarang sesuatu semua banyak lebih belajar cara gak nggak enggak",
    shapes: [/[a-z]{3,}(?:kan|nya)$/],
  },
  vi: {
    words:
      "tôi bạn anh chị em ông bà nó chúng họ mình của và hoặc nhưng là có không được đã đang sẽ này đó kia gì ai sao thế nào làm ở cho với từ trong ngoài trên dưới rất lắm quá cũng còn nữa muốn cần phải biết học nói đi đến về ra vào cảm ơn xin chào tốt hôm nay mai bây giờ một những các toi khong duoc cua nhung muon biet",
    letters: "ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹĩũ",
    bare: false,
  },
  tl: {
    words:
      "ako ikaw ka siya kami tayo kayo sila ko mo niya namin natin ninyo nila ang ng nang mga sa si ni at o pero ay ito iyan iyon yan yun na pa ba po opo hindi oo wala may mayroon meron gusto kailangan puwede pwede paano bakit kailan saan ano sino ilan salamat maganda mabuti ngayon bukas kahapon dito doon lahat marami din rin lang lamang naman talaga kasi kung para kong mong",
    shapes: [/^(?:mag|nag|pag|maka|naka)[a-z]{3,}$/],
  },
  sw: {
    words:
      "mimi wewe yeye sisi ninyi wao na ya wa za la cha vya kwa katika ni si hii hiyo huu ile kuna hakuna ndiyo ndio hapana sana pia lakini au kama nini nani vipi gani lini wapi je tafadhali asante habari nzuri sawa leo kesho jana hapa sasa kitu kila yote nataka unataka anataka tunataka naweza unaweza ninaweza ninapenda napenda",
    shapes: [/^ku[a-z]{4,}$/],
  },
  af: {
    words:
      "ek jy hy sy ons julle hulle die en of maar is was het sal kan wil moet nie ja nee ook nog al baie met van vir op in aan by na uit oor deur om te wat wie waar waarom wanneer hoe watter dat as omdat dankie asseblief goed vandag môre gister hier daar nou iets alles meer my jou haar",
  },
};
