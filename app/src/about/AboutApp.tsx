// About: what If This Finds You is, where the letters and the hands come from, the fonts, how it started, where to give
// back, contact; then the full credits, folded away. A short reading page (Rafael, 3 Nov 2026: "way too long"; about
// 600 words to read, under a minute): sections ruled off like a finding aid, their labels in the margin on a wide
// screen. Every claim is checked against the repo (the letters' counts against content/check-texts.mjs); lines waiting
// for Rafael's sign-off are listed in about/README.md.
import { useEffect, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { APP_NAME, NAME_WITH_DESCRIPTOR, withLogo } from '@/lib/brand';
import { SiteHeader } from '@/components/SiteHeader';
import { ARCHIVE_URL, FONTS_URL } from '@/lib/places';
import { LiveLine } from './LiveLine';

// ---------- the letters, as `node content/check-texts.mjs` counted them on 4 November 2026 ----------
// Update these when letters are switched on or off (the checker prints every one of them).
const LETTERS = {
  count: 123,
  from: 1395,
  to: 1929,
  languages: 14,
  writers: 119,
  womenShare: 60,
  african: 25,
  hispanic: 21,
  ordinaryShare: 83,
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
  { name: 'Internet Archive', href: 'https://archive.org/donate/', kept: <>Scans of 77 of the letters and four of the copybooks.</> },
  { name: 'Project Gutenberg', href: 'https://www.gutenberg.org/donate/', kept: <>Volunteers’ transcriptions of 22 letters.</> },
  { name: 'Wikimedia Foundation', href: 'https://donate.wikimedia.org/', kept: <>Six letters on Wikisource, and the Sütterlin alphabet on Commons.</> },
  { name: 'Fondation de BAnQ', href: 'https://www.jedonneenligne.org/fondationdebanq/', kept: <>For Québec’s national library, whose volunteers gave the hand our logo is written in.</> },
  { name: 'Project Runeberg', href: 'https://runeberg.org/admin/sponsors.html', kept: <>A volunteer library of Nordic texts, and two of the letters.</> },
];
/** One related cause, not a source: the people who still carry letters between families separated by war. */
const GIVE_ALSO = {
  name: 'International Committee of the Red Cross',
  href: 'https://www.icrc.org/en/donate',
  kept: <>Not one of our sources. It still carries messages between families separated by war.</>,
};

/** The project's code, public under the MIT licence (the fonts stay OFL, the letters public domain). */
const REPO_URL = 'https://github.com/rafaelcespedes/if-this-finds-you';

const SECTIONS = [
  { id: 'what', title: 'What this is' },
  { id: 'letters', title: 'The letters' },
  { id: 'hands', title: 'The hands' },
  { id: 'fonts', title: 'Fonts' },
  { id: 'made', title: 'How it started' },
  { id: 'give', title: 'Give back' },
  { id: 'contact', title: 'Contact' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const title = SECTIONS.find((s) => s.id === id)!.title;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="about-section">
      <h2 id={`${id}-title`} className="about-section-title">{title}</h2>
      <div className="about-section-body">{children}</div>
    </section>
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
        <ArrowLeft aria-hidden className="about-arrow about-arrow--out" />Donate
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

        <Section id="what">
          <p>
            This is a small collection of real letters, most by people nobody remembers: emigrants, settlers, children,
            soldiers, servants. A writer who never existed copies each one out by hand, stroke by stroke. Each visit
            opens on a writer and a letter picked at random.
          </p>
          <p>
            The name is how a message in a bottle begins. Each of these letters was meant for one person. Now one has
            found you. Only the words are the original writer’s.
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
          <p>
            Every letter is real and in the public domain. Each shows where it was found, with a link to the page, and
            if the source doesn’t say something, neither do we. They’re short excerpts in the writer’s own spelling and
            language. A “…” marks a cut.
          </p>
          <p><a className="about-link" href={withLogo(ARCHIVE_URL)}>Read all the letters<ArrowLeft aria-hidden className="about-arrow about-arrow--on" /></a></p>
        </Section>

        <Section id="hands">
          <p>
            Handwriting is learned, so every writer here starts from a hand someone was taught. The hands come from eight
            copybooks, from Rome in 1522 to Berlin in 1917, from Dr. A. V. Hershey’s 1967 stroke letters, and from
            volunteers in Québec and France today. Each writer then makes it their own, in slant, size, rhythm and the
            shape of each letter. A simulated pen writes it in ink on the kinds of paper people really used. Writers
            slip, too, and cross things out.
          </p>
          <p>
            No AI model draws the letters. The engine is plain code, and every letter shape carries its source. Most of
            its thirteen traditions are European or American, and so far it writes only the Latin alphabet.
          </p>
        </Section>

        <Section id="fonts">
          <p>
            Every hand here is a font you can keep, free and open source under the SIL Open Font License. A font holds
            four or five versions of each letter, so it’s a little steadier than the page.
          </p>
          <p><a className="about-link" href={withLogo(FONTS_URL)}>Browse the fonts<ArrowLeft aria-hidden className="about-arrow about-arrow--on" /></a></p>
        </Section>

        <Section id="made">
          {/* Rafael's own story (his words, 3 Nov 2026). Rueca has no public address in the repo, so it isn't linked */}
          <p>
            It started as a search for a font. Rafael Cespedes, a designer, was looking for a handwritten face for
            Rueca, another project of his. He couldn’t find the hand he had in mind, so he tried making one. It grew
            from there, a happy accident that got a little out of hand.
          </p>
          <p>
            It’s a free lab experiment with nothing to sell. He wanted to use AI in ways he finds clever. Drawing
            hundreds of handwriting fonts, for one, used to take too many resources to try. The fonts and{' '}
            <Out href={REPO_URL}>the code</Out> are open source.
          </p>
          <p className="about-credit-line">
            Designed by Rafael Cespedes and built with Claude.
          </p>
        </Section>

        <Section id="give">
          <p>
            Found this useful? These are the people who kept the letters and the hands. If you’d like to give back, give
            to them.
          </p>
          <ul className="about-give">
            {GIVE.map((g) => <GiveRow key={g.name} {...g} />)}
          </ul>
          <h3 className="about-subhead">For letters still being written</h3>
          <ul className="about-give">
            <GiveRow {...GIVE_ALSO} />
          </ul>
          <p className="about-give-note">Each link opens the organisation’s own donation page. We get nothing from it.</p>
        </Section>

        <Section id="contact">
          <p>Spotted a mistake in a letter or its story? Rafael would like to know.</p>
          <dl className="about-contact">
            <div><dt>Site</dt><dd><Out href="https://rafaelcespedes.com">rafaelcespedes.com</Out></dd></div>
            <div><dt>X</dt><dd><Out href="https://x.com/rafcespedes">@rafcespedes</Out></dd></div>
            <div><dt>GitHub</dt><dd><Out href={REPO_URL}>if-this-finds-you</Out></dd></div>
          </dl>
        </Section>

        {/* the full credits: the licences ask for them, so they stay, folded away and quiet */}
        <div className="about-credits">
        <details>
          <summary>Full credits and licences</summary>
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
            <p>
              Each letter is in the public domain in both the United States and Europe: it was first printed before 1931,
              and its writer died before 1956 (95 letters) or it was printed anonymously before 1956 (28 letters).
              Writers’ sex and heritage are counted only from what each source says, never guessed from a name; a letter
              written in Spanish or Brazilian Portuguese counts as Hispanic or Latin American. Counted on 4 November 2026.
            </p>

            <h3 className="about-subhead">The hands</h3>
            <ul className="about-sources">
              {HANDS.map((h) => (
                <li key={h.year + h.name}>
                  <span className="about-ledger-year">{h.year}</span> {h.name}, {h.place}. <Out href={h.href}>{h.source}</Out>
                </li>
              ))}
            </ul>
            <p>
              The copybooks are in the public domain. The Hershey Fonts were originally created by Dr. A. V. Hershey
              while working at the U.S. National Bureau of Standards; the format of the font data was originally created
              by James Hurt, Cognition, Inc. Present-day handwriting comes from{' '}
              <Out href="https://github.com/banq-dcn/Copiste-d-un-jour">Copiste d’un jour</Out> (Bibliothèque et
              Archives nationales du Québec, 2024) and{' '}
              <Out href="https://github.com/HTR-United/cremma-wikipedia">CREMMA-Wikipedia</Out> (HTR-United, 2022–23),
              both under <Out href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Out>. Their letter shapes
              were traced and redrawn, and their words aren’t used. Neither project endorses this one.
            </p>

            <h3 className="about-subhead">Fonts, type and code</h3>
            <p>
              The downloadable fonts are under the <Out href="https://openfontlicense.org">SIL Open Font License 1.1</Out>.
              This site is set in typefaces under the same licence. <Out href={REPO_URL}>The code</Out> is under the MIT
              licence.
            </p>

            <h3 className="about-subhead">Everything else</h3>
            <p>
              Every source the project used, 484 so far, is listed with what it decided in a reference library, still
              to be published.
            </p>
          </div>
        </details>
        </div>

        <footer className="about-colophon">
          <p className="about-colophon-name">{NAME_WITH_DESCRIPTOR}</p>
          <p>
            A lab experiment by Rafael Cespedes. Letters in the public domain; fonts under the SIL Open Font License; code
            under the MIT licence.
          </p>
        </footer>
      </main>
    </div>
  );
}
