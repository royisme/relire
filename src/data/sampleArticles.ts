import { Article, VocabWord } from '../types';

export const SAMPLE_ARTICLES: Article[] = [
  {
    id: 'petit-prince',
    title: 'Le Petit Prince et le Secret du Renard',
    level: 'B1',
    category: 'Littérature',
    source: 'Antoine de Saint-Exupéry',
    content: `— C'est une chose trop oubliée, dit le renard. Ça signifie « créer des liens... »
— Créer des liens ?
— Bien sûr, dit le renard. Tu n'es encore pour moi qu'un petit garçon tout semblable à cent mille petits garçons. Et je n'ai pas besoin de toi. Et tu n'as pas besoin de moi non plus. Je ne suis pour toi qu'un renard semblable à cent mille renards. Mais, si tu m'apprivoises, nous aurons besoin l'un de l'autre. Tu seras pour moi unique au monde. Je serai pour toi unique au monde...
Le petit prince commença à comprendre :
— Il y a une fleur... je crois qu'elle m'a apprivoisé...
— C'est possible, dit le renard. On voit sur la Terre toutes sortes de choses.
— Oh ! ce n'est pas sur la Terre, dit le petit prince.
Le renard parut très intrigué :
— Sur une autre planète ?
— Oui.
— Il y a des chasseurs, sur cette planète-là ?
— Non.
— Ça, c'est intéressant ! Et des poules ?
— Non.
— Rien n'est parfait, soupira le renard.
Mais le renard revint à son idée :
— Ma vie est monotone. Je chasse les poules, les hommes me chassent. Toutes les poules se ressemblent, et tous les hommes se ressemblent. Je m'y ennuie donc un peu. Mais, si tu m'apprivoises, ma vie sera comme ensoleillée. Je connaîtrai un bruit de pas qui sera différent de tous les autres. Les autres pas me font cacher sous terre. Le tien m'appellera hors du terrier, comme une musique. Et puis regarde ! Tu vois, là-bas, les champs de blé ? Je ne mange pas de pain. Le blé pour moi est inutile. Les champs de blé ne me rappellent rien. Et ça, c'est triste ! Mais tu as des cheveux couleur d'or. Alors ce sera merveilleux quand tu m'auras apprivoisé ! Le blé, qui est doré, me fera souvenir de toi. Et j'aimerai le bruit du vent dans le blé...
Le renard se tut et regarda longtemps le petit prince :
— S'il te plaît... apprivoise-moi ! dit-il.
— Je veux bien, répondit le petit prince, mais je n'ai pas beaucoup de temps. J'ai des amis à découvrir et beaucoup de choses à connaître.
— On ne connaît que les choses que l'on apprivoise, dit le renard. Les hommes n'ont plus le temps de rien connaître. Ils achètent des choses toutes faites chez les marchands. Mais comme il n'existe point de marchands d'amis, les hommes n'ont plus d'amis. Si tu veux un ami, apprivoise-moi !
— Adieu, dit le renard. Voici mon secret. Il est très simple : on ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux.
— L'essentiel est invisible pour les yeux, répéta le petit prince, afin de se souvenir.
— C'est le temps que tu as perdu pour ta rose qui fait ta rose si importante.
— C'est le temps que j'ai perdu pour ma rose... fit le petit prince, afin de se souvenir.`,
    createdAt: '2026-10-01',
  },
  {
    id: 'cafe-parisien',
    title: 'L\'Art de Vivre dans un Café Parisien',
    level: 'B2',
    category: 'Culture & Société',
    source: 'Chronique Parisienne',
    content: `À Paris, le café n'est point un simple lieu où l'on consomme une boisson chaude avant d'affronter la cadence effrénée du métro. C'est un véritable théâtre à ciel ouvert, une institution séculaire où s'entremêlent les arômes de torréfaction et les éclats de conversations animées.
Dès l'aube, alors que la brume matinale enveloppe encore les rives de la Seine, les garçons de café déploient sur les trottoirs les guéridons de rotin et les chaises tressées. Les habitués du quartier viennent y commander un « express » au comptoir ou s'installent en terrasse, abrités sous le store vermillon, pour feuilleter les journaux du matin.
Observer les passants tout en laissant tiédir sa tasse constitue ici un plaisir souverain, presque un rituel méditatif. Les écrivains y griffonnent leurs carnets, les étudiants débattent passionnément de philosophie ou de politique, tandis que des amoureux échangent des confidences à voix basse.
Bien que le rythme de la capitale se soit considérablement accéléré au fil des décennies, cette tradition demeure inébranlable. Elle incarne cette douceur de vivre typiquement française, où chaque pause devient une célébration du moment présent et de la liberté d'esprit.`,
    createdAt: '2026-10-02',
  },
  {
    id: 'tech-ecologie',
    title: 'L\'Intelligence Artificielle et la Transition Écologique',
    level: 'C1',
    category: 'Science & Avenir',
    source: 'Revue Prospective',
    content: `Face à l'urgence climatique sans précédent qui bouleverse notre planète, l'essor fulgurant des technologies d'intelligence artificielle suscite autant d'espoirs que d'interrogations légitimes.
D'une part, les algorithmes prédictifs permettent désormais d'optimiser la gestion des réseaux électriques, d'anticiper les catastrophes météorologiques extrêmes et de concevoir des matériaux plus durables avec une précision remarquable. Les chercheurs estiment que ces outils pourraient accélérer significativement la transition vers des énergies décarbonées.
Toutefois, ce progrès technologique s'accompagne d'une empreinte environnementale non négligeable. L'entraînement des modèles de langage de grande envergure et le fonctionnement ininterrompu des centres de données requièrent une consommation astronomique d'électricité et d'eau de refroidissement.
Il est donc primordial que la communauté scientifique et les décideurs politiques s'accordent sur un cadre éthique et écologique rigoureux. Pour que cette révolution numérique soit véritablement salutaire, il faudra veiller à ce que l'innovation serve la préservation du vivant, plutôt qu'elle ne précipite l'épuisement des ressources terrestres.`,
    createdAt: '2026-10-03',
  },
];

export const INITIAL_VOCAB: VocabWord[] = [
  {
    id: 'v-apprivoiser',
    word: 'apprivoiser',
    lemma: 'apprivoiser',
    ipa: '/a.pʁi.vwa.ze/',
    translation: '驯化；使驯服；使亲近',
    translationEn: 'To tame; to domesticate; to bond with',
    partOfSpeech: 'Verbe transitif (1er groupe)',
    contextSentence: 'Mais, si tu m\'apprivoises, nous aurons besoin l\'un de l\'autre.',
    contextTense: 'Présent de l\'indicatif, 2e personne du singulier',
    phoneticsGuide: '注意开头的双写p不送气，中间为小舌音[ʁ]，oi发作开音双元音[wa]，词尾-er发闭元音[e]。',
    phoneticsGuideEn: 'Unaspirated [p], uvular fricative [ʁ], open diphthong [wa], and closed final [e].',
    addedAt: '2026-10-01',
    repetitions: 1,
    intervalDays: 1,
    easeFactor: 2.5,
    nextReviewDate: '2026-10-04',
    reviewHistory: [],
  },
  {
    id: 'v-essentiel',
    word: 'essentiel',
    lemma: 'essentiel',
    ipa: '/e.sɑ̃.sjɛl/',
    translation: '实质；本质；至关重要的事物',
    translationEn: 'Essential; essence; what matters most',
    partOfSpeech: 'Nom masculin & Adjectif',
    contextSentence: 'L\'essentiel est invisible pour les yeux.',
    contextTense: 'Nom masculin singulier',
    phoneticsGuide: '注意鼻化元音[ɑ̃]：后部低元音，软腭下垂，气流同时通过口腔与鼻腔，切勿在末尾发出/n/辅音；-tiel发[sjɛl]。',
    phoneticsGuideEn: 'Nasal vowel [ɑ̃]: air flows simultaneously through mouth and nose; do not add an English /n/.',
    addedAt: '2026-10-01',
    repetitions: 2,
    intervalDays: 6,
    easeFactor: 2.6,
    nextReviewDate: '2026-10-04',
    reviewHistory: [],
  },
  {
    id: 'v-monotone',
    word: 'monotone',
    lemma: 'monotone',
    ipa: '/mɔ.nɔ.tɔn/',
    translation: '单调的；千篇一律的',
    translationEn: 'Monotonous; repetitive; dull',
    partOfSpeech: 'Adjectif',
    contextSentence: 'Ma vie est monotone. Je chasse les poules, les hommes me chassent.',
    contextTense: 'Adjectif féminin singulier',
    phoneticsGuide: '包含两个开口中元音[ɔ]，末尾为开音节中鼻辅音[n]，结尾不发音字母e弱化脱落。',
    phoneticsGuideEn: 'Contains open mid-vowels [ɔ], ending in nasal [n] with silent terminal -e.',
    addedAt: '2026-10-02',
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    nextReviewDate: '2026-10-04',
    reviewHistory: [],
  },
];
