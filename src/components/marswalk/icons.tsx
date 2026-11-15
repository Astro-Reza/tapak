import type { ReactNode, SVGProps } from "react";

/**
 * Marswalk line icons (Figma "Icon/*"): 24 px grid, 2 px square stroke.
 * Path data is exported from the Figma components. They take `currentColor`,
 * so recolor them with a text color token.
 */
const stroke = {
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "square",
} as const;

const paths = {
  signal: <path d="M4 20V17M9 20V13M14 20V9M19 20V5" {...stroke} />,
  check: <path d="M5 12.5L9.5 17L19 7.5" {...stroke} />,
  search: (
    <>
      <path
        d="M11 18C14.866 18 18 14.866 18 11C18 7.13401 14.866 4 11 4C7.13401 4 4 7.13401 4 11C4 14.866 7.13401 18 11 18Z"
        {...stroke}
      />
      <path d="M16.5 16.5L21 21" {...stroke} />
    </>
  ),
  north: <path d="M12 3L18 20L12 16L6 20L12 3Z" fill="currentColor" {...stroke} />,
  locate: (
    <>
      <path
        d="M12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19Z"
        {...stroke}
      />
      <path
        d="M12 14.5C13.3807 14.5 14.5 13.3807 14.5 12C14.5 10.6193 13.3807 9.5 12 9.5C10.6193 9.5 9.5 10.6193 9.5 12C9.5 13.3807 10.6193 14.5 12 14.5Z"
        {...stroke}
      />
      <path d="M12 2V5M12 19V22M2 12H5M19 12H22" {...stroke} />
    </>
  ),
  plus: <path d="M12 5V19M5 12H19" {...stroke} />,
  arrow: <path d="M12 19V5M6 11L12 5L18 11" {...stroke} />,
  look: (
    <>
      <path d="M2 12C4.5 7.5 8 5 12 5C16 5 19.5 7.5 22 12C19.5 16.5 16 19 12 19C8 19 4.5 16.5 2 12Z" {...stroke} />
      <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" {...stroke} />
    </>
  ),
  minus: <path d="M5 12H19" {...stroke} />,
  close: <path d="M6 6L18 18M18 6L6 18" {...stroke} />,
  warning: (
    <>
      <path d="M12 3L22 20H2L12 3Z" {...stroke} />
      <path d="M12 10V14M12 17V17.5" {...stroke} />
    </>
  ),
  satellite: (
    <>
      <path d="M15 9H9V15H15V9Z" {...stroke} />
      <path d="M7 10H1V14H7V10Z" {...stroke} />
      <path d="M23 10H17V14H23V10Z" {...stroke} />
      <path d="M7 12H9M15 12H17M12 9V6" {...stroke} />
      <path
        d="M12 6C12.8284 6 13.5 5.32843 13.5 4.5C13.5 3.67157 12.8284 3 12 3C11.1716 3 10.5 3.67157 10.5 4.5C10.5 5.32843 11.1716 6 12 6Z"
        {...stroke}
      />
    </>
  ),
  antenna: (
    <>
      <path
        d="M5 13.0001C5.65002 13.6502 6.42172 14.1659 7.27105 14.5177C8.12038 14.8695 9.03069 15.0506 9.95 15.0506C10.8693 15.0506 11.7796 14.8695 12.6289 14.5177C13.4783 14.1659 14.25 13.6502 14.9 13.0001L5 3.1001C4.34991 3.75012 3.83423 4.52182 3.48241 5.37115C3.13058 6.22047 2.94949 7.13078 2.94949 8.0501C2.94949 8.96941 3.13058 9.87972 3.48241 10.729C3.83423 11.5784 4.34991 12.3501 5 13.0001Z"
        {...stroke}
      />
      <path d="M10 8L15 3" {...stroke} />
      <path d="M8 16L6 21H14L12 16" {...stroke} />
    </>
  ),
  astronaut: (
    <>
      <path
        d="M12 14.5C15.0376 14.5 17.5 12.0376 17.5 9C17.5 5.96243 15.0376 3.5 12 3.5C8.96243 3.5 6.5 5.96243 6.5 9C6.5 12.0376 8.96243 14.5 12 14.5Z"
        {...stroke}
      />
      <path d="M9 9H15" {...stroke} />
      <path d="M5 21C6 17 9 15.5 12 15.5C15 15.5 18 17 19 21" {...stroke} />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        {...stroke}
      />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" {...stroke} />
      <path d="M9 3V21" {...stroke} />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 24,
  ...props
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
