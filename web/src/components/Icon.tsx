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
  | 'download' | 'check' | 'refresh' | 'spinner';

/** Icone piene: sagome compatte, leggibili anche a 14px. */
const FILLED: Partial<Record<IconName, React.ReactNode>> = {
  play: <path d="M8 5.2v13.6L19 12z" />,
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
