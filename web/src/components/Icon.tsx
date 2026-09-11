/**
 * Icon.tsx — le icone dell'interfaccia, disegnate in SVG.
 *
 * Perché non emoji: ⏸ e 🔁 sono caratteri, quindi ogni sistema li disegna a
 * modo suo (su macOS a colori, su Windows monocromatici, su Android diversi
 * ancora) e non si lasciano allineare né colorare. Questi invece ereditano il
 * colore del testo con `currentColor` e restano nitidi a qualsiasi dimensione.
 *
 * Due famiglie: i comandi di riproduzione sono pieni, tutto il resto è a
 * tratto sottile.
 */

export type IconName =
  | 'play' | 'pause' | 'prev' | 'next'
  | 'shuffle' | 'repeat' | 'repeatOne'
  | 'volume' | 'mute'
  | 'download' | 'check' | 'refresh' | 'spinner'
  | 'queue' | 'queueNext' | 'close' | 'up' | 'down' | 'lyrics'
  | 'more' | 'plus' | 'playlist' | 'trash' | 'heart' | 'heartFilled' | 'chart'
  | 'grid' | 'library' | 'search' | 'artist' | 'note' | 'downloadBox';

/** Icone piene: sagome compatte, leggibili anche a 14px. */
const FILLED: Partial<Record<IconName, React.ReactNode>> = {
  play: <path d="M8 5.2v13.6L19 12z" />,
  heartFilled: <path d="M12 20.3s-8-5-8-10.2A4.7 4.7 0 0 1 12 7.2a4.7 4.7 0 0 1 8 2.9c0 5.2-8 10.2-8 10.2Z" />,
  pause: (
    <>
      <rect x="7" y="5.2" width="3.4" height="13.6" rx="1.2" />
      <rect x="13.6" y="5.2" width="3.4" height="13.6" rx="1.2" />
    </>
  ),
  prev: (
    <>
      <rect x="5.5" y="6" width="2.4" height="12" rx="1.1" />
      <path d="M19 6.4v11.2L10.2 12z" />
    </>
  ),
  next: (
    <>
      <path d="M5 6.4v11.2L13.8 12z" />
      <rect x="16.1" y="6" width="2.4" height="12" rx="1.1" />
    </>
  ),
};

/** Icone a tratto: stesso spessore ovunque, così stanno insieme. */
const STROKED: Partial<Record<IconName, React.ReactNode>> = {
  shuffle: (
    <>
      <path d="M16 3h5v5" />
      <path d="M4 20 21 3" />
      <path d="M21 16v5h-5" />
      <path d="m15 15 6 6" />
      <path d="m4 4 5 5" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 1 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 23-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  mute: (
    <>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="m22 9-5 6" />
      <path d="m17 9 5 6" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </>
  ),
  check: <path d="m20 6-11 11-5-5" />,
  queue: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h9" />
    </>
  ),
  queueNext: (
    <>
      <path d="M4 7h12" />
      <path d="M4 12h12" />
      <path d="M4 17h7" />
      <path d="M17.5 14v7" />
      <path d="M14 17.5h7" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  up: <path d="m6 15 6-6 6 6" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </>
  ),
  library: (
    <>
      <rect x="3" y="5" width="18" height="15" rx="3" />
      <path d="M13.5 15.5V9.5l4-1.2" />
      <circle cx="11.5" cy="15.5" r="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </>
  ),
  artist: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  note: (
    <>
      <path d="M9.5 18V6l10-2.5V16" />
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="17" cy="16" r="2.5" />
    </>
  ),
  downloadBox: (
    <>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  heart: <path d="M12 20s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.3 12 20 12 20Z" />,
  chart: (
    <>
      <path d="M5 20V11" />
      <path d="M12 20V4" />
      <path d="M19 20v-6" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  playlist: (
    <>
      <path d="M4 7h11" />
      <path d="M4 12h11" />
      <path d="M4 17h6" />
      <circle cx="17.5" cy="16.5" r="2.5" />
      <path d="M20 16.5V8l1.5 1" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5h5v2" />
      <path d="M6.5 7l.8 12.2a1 1 0 0 0 1 .8h7.4a1 1 0 0 0 1-.8L17.5 7" />
    </>
  ),
  // Fumetto con due righe di testo: si distingue a colpo d'occhio dalle tre
  // righe piene della coda, che altrimenti sarebbero quasi identiche.
  lyrics: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="3.5" />
      <path d="M9 17v3.4L13.2 17" />
      <path d="M7.5 9h9" />
      <path d="M7.5 12.5h5.5" />
    </>
  ),
  down: <path d="m6 9 6 6 6-6" />,
  refresh: (
    <>
      <path d="M21 4v6h-6" />
      <path d="M3 20v-6h6" />
      <path d="M3.5 9a9 9 0 0 1 14.9-3.4L21 10" />
      <path d="M20.5 15a9 9 0 0 1-14.9 3.4L3 14" />
    </>
  ),
  // Arco parziale: la rotazione la mette la CSS (.spin)
  spinner: <path d="M21 12a9 9 0 1 1-6.2-8.6" />,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const filled = FILLED[name];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`ico${name === 'spinner' ? ' spin' : ''}`}
      aria-hidden="true"
      focusable="false"
      {...(filled
        ? { fill: 'currentColor' }
        : {
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.9,
            strokeLinecap: 'round' as const,
            strokeLinejoin: 'round' as const,
          })}
    >
      {filled ?? STROKED[name]}
      {/* "Ripeti un brano": stessa ansa, con l'1 al centro */}
      {name === 'repeatOne' && (
        <>
          {STROKED.repeat}
          <text
            x="12" y="15.4"
            textAnchor="middle"
            fontSize="8.5"
            fontWeight="700"
            fill="currentColor"
            stroke="none"
          >1</text>
        </>
      )}
    </svg>
  );
}
