// About: what If This Finds You is, where the letters and the hands come from, the fonts, how it was made, credits.
// A reading page: one column of text with its sections ruled off like a finding aid, their labels in the margin on a
// wide screen, catalogue-style facts and footnote credits. Every claim here is checked against the repo (the letters'
// counts against content/check-texts.mjs); lines marked "Rafael" in about/README.md wait for his sign-off.
import { useEffect, type ReactNode } from 'react';
import { APP_NAME, NAME_WITH_DESCRIPTOR, withLogo } from '@/lib/brand';
import { SiteHeader } from '@/components/SiteHeader';
import { ARCHIVE_URL, FONTS_URL } from '@/lib/places';
import { LiveLine } from './LiveLine';

// ---------- the letters, as `node content/check-texts.mjs` counted them on 3 November 2026 ----------
// Update these when letters are switched on or off (the checker prints every one of them).
const LETTERS = {
  count: 127,
  from: 1395,
  to: 1929,
  languages: 14,
  writers: 123,
  women: 75,
  womenShare: 59,
  sexNotStated: 13,
  african: 25,
  hispanic: 21,
  ordinaryShare: 83,
  minWords: 16,
  maxWords: 89,
};

/** The taught hands the engine draws on (engine/sources/*.js, each file's own source line). */
const HANDS: { year: string; name: string; place: string; source: ReactNode; href: string }[] = [
  { year: '1522', name: 'Chancery italic', place: 'Rome', href: 'https://archive.org/details/laoperinadiludou00arri', source: <>Ludovico degli Arrighi, <cite>La Operina</cite></> },
  { year: '1618', name: 'Dutch running hand', place: 'Rotterdam', href: 'https://id.rijksmuseum.nl/200612180', source: <>Maria Strick, <cite>Schat oft voorbeelt ende verthooninge van verscheyden geschriften</cite></> },
  { year: '1776', name: 'Spanish bastarda', place: 'Madrid', href: 'https://archive.org/details/A254379', source: <>Francisco Javier de Santiago Palomares, <cite>Arte nueva de escribir</cite></> },
  { year: '1849', name: 'Norwegian school hand and Kurrent', place: 'Christiania (Oslo)', href: 'https://www.nb.no/items/URN:NBN:no-nb_digibok_2016101928012', source: <>Brandt, <cite>Skjønskrivningsregler</cite></> },
  { year: '1866', name: 'Spencerian', place: 'New York', href: 'https://archive.org/details/compendium-of-spencerian-or-semi-angular-penmanship', source: <>Platt Rogers Spencer, <cite>Compendium of Spencerian or Semi-Angular Penmanship</cite></> },
  { year: '1906', name: 'Polish school copperplate', place: 'Warsaw', href: 'http://polona.pl/item/54432597/', source: <>Konrad Prószyński, <cite>Wprawy w piękne pisanie piórem</cite></> },
  { year: '1915', name: 'Palmer business hand', place: 'New York', href: 'https://archive.org/details/palmermethodbus00palm', source: <>A. N. Palmer, <cite>The Palmer Method of Business Writing</cite></> },
  { year: '1917', name: 'Sütterlin school hand', place: 'Berlin', href: 'https://commons.wikimedia.org/wiki/File:S%C3%BCtterlin_,_lateinisches_Alphabet.jpg', source: <>Ludwig Sütterlin, <cite>Neuer Leitfaden für den Schreibunterricht</cite></> },
  { year: '1967', name: 'Print and script', place: 'United States', href: 'https://emergent.unpythonic.net/software/hershey', source: <>Dr. A. V. Hershey’s stroke drawings for the U.S. National Bureau of Standards</> },
  { year: '2023', name: 'Everyday French', place: 'France', href: 'https://github.com/HTR-United/cremma-wikipedia', source: <>Volunteers’ handwriting shared by CREMMA-Wikipedia, under CC BY 4.0</> },
  { year: '2024', name: 'Everyday print', place: 'Québec', href: 'https://github.com/banq-dcn/Copiste-d-un-jour', source: <>Volunteers’ copies for <cite>Copiste d’un jour</cite>, Bibliothèque et Archives nationales du Québec, under CC BY 4.0</> },
];

/** The printed sources most letters come from (content/sample-texts.json); each letter's own page links its page. */
const LETTER_SOURCES: { href: string; text: ReactNode }[] = [
  { href: 'https://archive.org/details/sim_african-repository_1834-07_10_5', text: <><cite>The African Repository</cite> (American Colonization Society), 1832–1859: letters from settlers in Liberia</> },
  { href: 'https://archive.org/details/mindofnegroasref00wood', text: <>Carter G. Woodson (ed.), <cite>The Mind of the Negro as Reflected in Letters Written During the Crisis, 1800–1860</cite> (1926)</> },
  { href: 'https://www.gutenberg.org/ebooks/21093', text: <><cite>The Journal of Negro History</cite>, October 1919: letters of the Great Migration</> },
  { href: 'https://www.loc.gov/resource/sn83045462/1908-12-20/ed-1/?sp=54', text: <><cite>Evening Star</cite> (Washington, D.C.), 20 December 1908: letters to Santa Claus from the Dead Letter Office, via Chronicling America</> },
  { href: 'https://archive.org/details/harpersyoungpeop00newy1884', text: <>Children’s letters to <cite>Harper’s Young People</cite> and <cite>St. Nicholas</cite>, 1882–1892</> },
  { href: 'https://archive.org/details/BNA_S001181802_19231228N04028', text: <><cite>Crítica</cite> (Buenos Aires), 1923–24: children’s letters to the Three Kings</> },
  { href: 'https://archive.org/details/cihm_35220', text: <><cite>Letters from Sussex Emigrants</cite> in Upper Canada (Petworth, 1833–37)</> },
  { href: 'https://www.gutenberg.org/ebooks/16623', text: <>Elinore Pruitt Stewart, <cite>Letters of a Woman Homesteader</cite> (1914)</> },
  { href: 'https://www.gutenberg.org/cache/epub/39978/pg39978-images.html', text: <>James Wilson Hyde, <cite>The Royal Mail: its Curiosities and Romance</cite> (1889)</> },
  { href: 'https://archive.org/details/sim_american-historical-association-annual-report_1919_2', text: <><cite>The Austin Papers</cite>, ed. Eugene C. Barker (1924)</> },
  { href: 'https://archive.org/details/correspondancein00larc', text: <><cite>Correspondance intime de l’armée d’Égypte interceptée par la croisière anglaise</cite> (1866)</> },
  { href: 'https://www.gutenberg.org/ebooks/42239', text: <>The Paston, Stonor and Verney family letters, printed 1899–1919</> },
];

/**
 * Give back: the sources this project leans on most that take donations online, each checked on the organisation's
 * own site on 3 November 2026 (only their own donation pages; nothing is collected here). Counts from
 * content/sample-texts.json (letters whose source links there) and engine/sources/*.js (copybooks).
 */
const GIVE: { name: string; href: string; kept: ReactNode }[] = [
  { name: 'Internet Archive', href: 'https://archive.org/donate/', kept: <>77 of the 127 letters were read from its scans, and so were four of the copybooks the hands were traced from.</> },
  { name: 'Project Gutenberg', href: 'https://www.gutenberg.org/donate/', kept: <>Its volunteers’ transcriptions carry 22 of the letters, from the Paston family to a homesteader in Wyoming.</> },
  { name: 'Wikimedia Foundation', href: 'https://donate.wikimedia.org/', kept: <>Wikisource holds the transcriptions of six letters, and Wikimedia Commons the Sütterlin alphabet.</> },
  { name: 'Fondation de BAnQ', href: 'https://www.jedonneenligne.org/fondationdebanq/', kept: <>It supports Québec’s national library, whose <cite>Copiste d’un jour</cite> volunteers gave the everyday print hand. The logo is written in it.</> },
  { name: 'Project Runeberg', href: 'https://runeberg.org/admin/sponsors.html', kept: <>A volunteer library of Nordic texts at Linköping University. Two of the letters come from it.</> },
];
/** One related cause, not a source: the people who still carry letters between families separated by war. */
const GIVE_ALSO = {
  name: 'International Committee of the Red Cross',
  href: 'https://www.icrc.org/en/donate',
  kept: <>Not one of our sources, but the same work today: the Red Cross still carries messages between families separated by war, and searches for people who have gone missing.</>,
};

const SECTIONS = [
  { id: 'what', title: 'What this is' },
  { id: 'letters', title: 'The letters' },
  { id: 'hands', title: 'The hands' },
  { id: 'fonts', title: 'Fonts' },
  { id: 'made', title: 'How it was made' },
  { id: 'credits', title: 'Credits and sources' },
  { id: 'contact', title: 'Contact' },
  { id: 'give', title: 'Give back' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const n = SECTIONS.findIndex((s) => s.id === id) + 1;
  const title = SECTIONS[n - 1].title;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="about-section">
      <h2 id={`${id}-title`} className="about-section-title">
        <span className="about-section-no" aria-hidden>{n}</span>
        <span>{title}</span>
      </h2>
      <div className="about-section-body">{children}</div>
    </section>
  );
}

/** A footnote mark in the text, and the way back from the note. */
function Note({ n }: { n: number }) {
  return (
    <sup className="about-noteref">
      <a id={`ref-${n}`} href={`#note-${n}`} aria-label={`Note ${n}`}>{n}</a>
    </sup>
  );
}

function Out({ href, children }: { href: string; children: ReactNode }) {
  return <a className="about-link" href={href} target="_blank" rel="noopener">{children}</a>;
}

/** One place to give: who, what it kept for this project, and its own donation page in a new tab. */
function GiveRow({ name, href, kept }: { name: string; href: string; kept: ReactNode }) {
  return (
    <li>
      <span className="about-give-text">
        <span className="about-give-name">{name}</span>
        <span className="about-give-kept">{kept}</span>
      </span>
      <a className="about-give-link" href={href} target="_blank" rel="noopener" aria-label={`Donate to ${name} (opens in a new tab)`}>
        Donate
      </a>
    </li>
  );
}

export function AboutApp() {
  useEffect(() => { document.title = `About · ${APP_NAME}`; }, []);
  const L = LETTERS;

  return (
    <div className="about min-h-dvh">
      <SiteHeader current="about" />

      <main className="about-main">
        <div className="about-head">
          <p className="about-kicker">About</p>
          <h1 className="about-title">{APP_NAME}</h1>
          <p className="about-lede">Real letters by ordinary people, written out by hand by writers who never existed.</p>
          <LiveLine />
        </div>

        <nav className="about-contents" aria-label="On this page">
          <p className="about-label">Contents</p>
          <ol>
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`}><span className="about-contents-no" aria-hidden>{i + 1}</span>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="what">
          <p>
            {APP_NAME} is a small archive of real letters. Most were written by people nobody remembers: emigrants and
            settlers, children and parents, soldiers, servants and farmers. Each letter is written out again on letter
            paper, stroke by stroke, by a fictional writer with a hand of their own.
          </p>
          <p>
            The name is how a message in a bottle begins. These letters were meant for one person, and some never reached
            them. Now one has found you. Read it, press Find another for a new letter in a new hand, or write a reply and
            watch it go down in ink.
          </p>
          <p>
            Keep one thing in mind as you read: the words are the original writer’s, but the handwriting never is. No
            letter here is drawn the same way twice, because every stroke is written fresh.
          </p>
        </Section>

        <Section id="letters">
          <dl className="about-facts">
            <div><dt>Letters</dt><dd>{L.count}</dd></div>
            <div><dt>Written</dt><dd>{L.from}–{L.to}</dd></div>
            <div><dt>Languages</dt><dd>{L.languages}</dd></div>
            <div><dt>Writers</dt><dd>{L.writers}</dd></div>
            <div><dt>By women</dt><dd>{L.womenShare}%</dd></div>
            <div><dt>By ordinary people</dt><dd>{L.ordinaryShare}%</dd></div>
            <div><dt>By African and African American writers</dt><dd>{L.african}</dd></div>
            <div><dt>By Hispanic and Latin American writers</dt><dd>{L.hispanic}</dd></div>
          </dl>
          <p className="about-facts-note">Counted on 3 November 2026.<Note n={1} /></p>
          <p>
            Every letter comes with its true origin: who wrote it, to whom, when and where, and the book, newspaper or
            archive it survives in, with a link to the page. If a source doesn’t say something, neither do we. We don’t
            add a greeting, a signature or a back story the source doesn’t have.
          </p>
          <p>
            Among them are children writing to Santa Claus and to the Three Kings, African American settlers in Liberia
            writing home from 1832 on, families moving north in the Great Migration, a Tejana writing to Stephen F.
            Austin in 1824, and Frenchmen in Egypt in 1798 whose letters home were seized at sea. A handful are by
            famous writers, among them Phillis Wheatley, Ignatius Sancho, Sor Juana Inés de la Cruz and Emily Dickinson.
          </p>
          <p>
            {L.women} of the {L.count} letters are by women. When a source doesn’t say whether the writer was a woman or
            a man, we leave it blank, and {L.sexNotStated} letters are like that.
          </p>
          <h3 className="about-subhead">As printed</h3>
          <p>
            The letters are short, {L.minWords} to {L.maxWords} words. Where we cut, you’ll see “…”. The spelling is the
            writer’s own, from Middle English to the unschooled spelling of settlers and migrants, and nothing is
            translated: each letter is in the language it was written in.
          </p>
          <h3 className="about-subhead">How they were chosen</h3>
          <p>
            Each letter had to be in the public domain in both the United States and Europe. For most, that means it was
            printed before 1931 and its writer died long ago.<Note n={2} /> We didn’t ask any archive for permission, so
            some wonderful collections with non-commercial terms are left out.
          </p>
          <p>
            The rest is balance, and a checker holds the collection to it: at least 70% of the letters by ordinary
            people, at least 55% by women, and at least 15 each by African or African American writers and by Hispanic
            or Latin American writers. Today that’s {L.ordinaryShare}%, {L.womenShare}%, {L.african} and {L.hispanic}.
          </p>
          <p><a className="about-link about-go" href={withLogo(ARCHIVE_URL)}>Read all the letters</a></p>
        </Section>

        <Section id="hands">
          <p>
            Handwriting is learned. The way you make a g depends on where and when you went to school. So each writer
            here starts from a hand someone was taught, traced from an old copybook or from real people’s writing, and
            then makes it their own.
          </p>
          <p>The engine knows thirteen traditions, from five centuries:</p>
          <ol className="about-ledger">
            {HANDS.map((h) => (
              <li key={h.year + h.name}>
                <span className="about-ledger-year">{h.year}</span>
                <span className="about-ledger-text">
                  <span className="about-ledger-name">{h.name}</span>, {h.place}.{' '}
                  <Out href={h.href}>{h.source}</Out>
                </span>
              </li>
            ))}
          </ol>
          <p>
            A writer is a seed, a short code like quiet-heron-17, and the seed settles everything about them: where they
            went to school, and sometimes a second school they picked up later; how they slant, size and space their
            letters, and how fast they write; which form they like for each letter, a looped l or a plain one, a 7 with a
            bar or without. The same seed always gives the same writer. Their names are made up too, with first names
            and surnames from many countries paired by chance.
          </p>
          <p>
            Then a simulated pen writes each letter along its traced path: a ballpoint, gel pen, fountain pen, pointed
            dip pen, broad italic nib, felt-tip or pencil. Ink pools where the pen rests and runs heavier on slow
            downstrokes, a ballpoint skips on a quick upstroke, and iron-gall ink browns with age. The paper is the kind
            people wrote on: letter pads, laid paper, airmail sheets and aerogrammes, pages torn from school exercise
            books, postcards.
          </p>
          <p>
            And writers make mistakes. A wrong letter is written over in heavier ink, a misspelt word is struck out and
            written again, a forgotten word goes in above the line with a caret. Each writer fixes things their own way:
            a careful one rules a single straight line, a hurried one scribbles.
          </p>
          <h3 className="about-subhead">What it can’t do</h3>
          <ul className="about-list">
            <li>
              No AI model draws these hands. The engine is ordinary code that runs in your browser: traced letters, rules
              and chance. So the hands are only as varied as the traditions behind them.
            </li>
            <li>
              Thirteen traditions are a start, and most are European or American. Many of the world’s school hands
              aren’t here yet, and only the Latin alphabet is.
            </li>
            <li>
              Some hands are messy, cramped or hard to read, as real hands are. We don’t tidy them, but the hardest to
              read stay out of the mix unless you ask for them.
            </li>
            <li>
              Kurrent and the Dutch running hand are hard for most people to read today. You meet them only when you ask,
              or when a letter is old enough to call for the Dutch hand.
            </li>
          </ul>
        </Section>

        <Section id="fonts">
          <p>
            Every hand here is a font you can keep, free and open source under the SIL Open Font License 1.1. Use them
            for anything, commercial work included, and change them and share them. The one thing you can’t do is sell a
            font on its own.
          </p>
          <p>
            Each download has an .otf and a .ttf file with 319 characters, enough for most European languages, and a
            list of every source its letters came from.
          </p>
          <p>
            A font is steadier than the page. A font file can only hold a few versions of each letter, so ours swap
            between four or five as you type, and a word rarely comes out the same twice. The rest stays on the site:
            how a line drifts, how a word leans, how the ink runs thin. Most apps swap the versions on their own; in
            Word, turn on contextual alternates.
          </p>
          <p><a className="about-link about-go" href={withLogo(FONTS_URL)}>Browse the fonts</a></p>
        </Section>

        <Section id="made">
          {/* Rafael's own story (his words, 3 Nov 2026). Rueca has no public address in the repo, so it isn't linked */}
          <p>
            It started as a search for a font. Rafael wanted a handwritten face for Rueca, another project of his, and
            couldn’t find the hand he had in mind, so he tried making one. The experiment grew from there: a happy
            accident that got a little out of hand.
          </p>
          <p>
            {APP_NAME} is a lab experiment by Rafael Cespedes, a designer. It’s free, and it isn’t a business.
          </p>
          <p>
            Rafael wanted to use AI in ways he finds clever, on things that used to take too many resources to try.
            Nobody would draw hundreds of handwriting fonts by hand, trace copybooks letter by letter, or check the
            rights of two hundred letters on two continents for a side project. With AI, one designer could.
          </p>
          <p className="about-credit-line">
            Designed by Rafael Cespedes and built with Claude, an AI model made by Anthropic.
          </p>
          <p>
            The handwriting itself doesn’t come from an AI model. Once built, the engine is plain code, and every letter
            shape it uses carries the source it came from.
          </p>
          <p>
            The hope is to bring letters, people and handwriting traditions that rarely get the spotlight into it, and
            maybe to give other designers an idea or two. The fonts are open source now; the rest of the project, code
            and all, will follow once it’s polished.
          </p>
        </Section>

        <Section id="credits">
          <div className="about-notes">
            <h3 className="about-subhead">The letters</h3>
            <p>Every letter’s own page names its source and links to it. Most come from these:</p>
            <ul className="about-sources">
              {LETTER_SOURCES.map((s) => (
                <li key={s.href}><Out href={s.href}>{s.text}</Out></li>
              ))}
            </ul>
            <p>
              Read from scans and transcriptions at the Internet Archive, Project Gutenberg, the Library of Congress, the
              Royal Danish Library, the National Library of Norway, the Prague City Library, the Hungarian Electronic
              Library, the DBNL, the Bavarian State Library, Project Runeberg, Wikisource and the UK National Archives.
            </p>

            <h3 className="about-subhead">The hands</h3>
            <p>
              Traced from the copybooks listed in section 3, all in the public domain. The Hershey Fonts were
              originally created by Dr. A. V. Hershey while working at the U.S. National Bureau of Standards; the format
              of the font data was originally created by James Hurt, Cognition, Inc. Present-day handwriting comes from{' '}
              <Out href="https://github.com/banq-dcn/Copiste-d-un-jour">Copiste d’un jour</Out> (Bibliothèque et
              Archives nationales du Québec, 2024) and{' '}
              <Out href="https://github.com/HTR-United/cremma-wikipedia">CREMMA-Wikipedia</Out> (HTR-United, 2022–23),
              both under <Out href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Out>. Their letter shapes
              were traced and redrawn, and their words aren’t used. Neither project endorses this one.
            </p>

            <h3 className="about-subhead">Fonts and type</h3>
            <p>
              The downloadable fonts are under the <Out href="https://openfontlicense.org">SIL Open Font License 1.1</Out>.
              This site is set in Alegreya, Alegreya SC and Piazzolla by Huerta Tipográfica, and Atkinson Hyperlegible
              Next by the Braille Institute, all under the same licence.
            </p>

            <h3 className="about-subhead">Everything else</h3>
            <p>
              Every source the project used, 484 so far, from archives and copybooks to research papers, is listed with
              what it decided in a reference library, to be published with the code.
            </p>

            <h3 className="about-subhead">Notes</h3>
            <ol className="about-footnotes">
              <li id="note-1">
                Groups are counted only from what each source says, never guessed from a name. A letter written in
                Spanish or Brazilian Portuguese counts as Hispanic or Latin American even when its source gives no
                nationality. <a href="#ref-1" className="about-back" aria-label="Back to note 1 in the text">↩</a>
              </li>
              <li id="note-2">
                In the United States, a letter passes if it was first printed before 1931 (125 letters), or if it was first
                made public in 2003 or later and is old enough: its writer died before 1956 or, with no known date of
                death, it was written before 1906 (2 letters). In Europe, it passes if its writer died
                before 1956 (98 letters) or it was printed anonymously before 1956 (29 letters).{' '}
                <a href="#ref-2" className="about-back" aria-label="Back to note 2 in the text">↩</a>
              </li>
            </ol>
          </div>
        </Section>

        <Section id="contact">
          <p>
            {APP_NAME} is made by Rafael Cespedes. If you spot a mistake in a letter or its story, he’d like to know.
          </p>
          <dl className="about-contact">
            <div><dt>Site</dt><dd><Out href="https://rafaelcespedes.com">rafaelcespedes.com</Out></dd></div>
            <div><dt>X</dt><dd><Out href="https://x.com/rafcespedes">@rafcespedes</Out></dd></div>
          </dl>
        </Section>

        <Section id="give">
          <p>
            Found this useful? It exists because these people kept the letters and the hands, and each of them takes
            donations. If you’d like to give back, give to them.
          </p>
          <ul className="about-give">
            {GIVE.map((g) => <GiveRow key={g.name} {...g} />)}
          </ul>
          <h3 className="about-subhead">For letters still being written</h3>
          <ul className="about-give">
            <GiveRow {...GIVE_ALSO} />
          </ul>
          <p className="about-give-note">
            Each link opens the organisation’s own donation page. We aren’t connected to any of them and get nothing
            from them.
          </p>
        </Section>

        <footer className="about-colophon">
          <p className="about-colophon-name">{NAME_WITH_DESCRIPTOR}</p>
          <p>A lab experiment by Rafael Cespedes. Letters in the public domain; fonts under the SIL Open Font License.</p>
        </footer>
      </main>
    </div>
  );
}
