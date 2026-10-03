import React from "react";

export type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

const makeIcon = (children: React.ReactNode) => {
  const Icon = ({ size = 16, className, ...props }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
      className={className}
    >
      {children}
    </svg>
  );
  Icon.displayName = "CadenceIcon";
  return Icon;
};

export const Activity = makeIcon(<path d="M3 12h4l2.5-7 5 14L17 12h4" />);
export const AlertCircle = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></>);
export const AlignLeft = makeIcon(<path d="M4 6h16M4 12h10M4 18h13" />);
export const ArrowDown = makeIcon(<><path d="M12 5v14M19 12l-7 7-7-7" /></>);
export const ArrowUp = makeIcon(<><path d="M12 19V5M5 12l7-7 7 7" /></>);
export const BookOpen = makeIcon(<><path d="M12 6C10.2 4.5 8 4 5 4v15c3 0 5.2.5 7 2 1.8-1.5 4-2 7-2V4c-3 0-5.2.5-7 2z" /><path d="M12 6v15" /></>);
export const Check = makeIcon(<path d="M4 12.5l5 5L20 6.5" />);
export const CheckCircle2 = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 5-5" /></>);
export const ChevronDown = makeIcon(<path d="m6 9 6 6 6-6" />);
export const ChevronUp = makeIcon(<path d="m6 15 6-6 6 6" />);
export const Clock = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const Cpu = makeIcon(<><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>);
export const Disc = makeIcon(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>);
export const Disc3 = makeIcon(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3a9 9 0 018.5 6M12 21a9 9 0 01-8.7-6.2" /></>);
export const Dock = makeIcon(<><rect x="2" y="12" width="20" height="8" rx="4" /><circle cx="7" cy="16" r="1" /><circle cx="12" cy="16" r="1" /><circle cx="17" cy="16" r="1" /></>);
export const Download = makeIcon(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M12 3v12M7 10l5 5 5-5" /></>);
export const Eye = makeIcon(<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></>);
export const EyeOff = makeIcon(<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /><path d="m3 3 18 18" /></>);
export const Film = makeIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4" /></>);
export const FolderSync = makeIcon(<><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v3" /><path d="M3 7v10a2 2 0 002 2h10" /><path d="m16 13 2-2 2 2M18 11v4a2 2 0 01-2 2h-1" /></>);
export const GripVertical = makeIcon(<><circle cx="9" cy="5.5" r="1.2" /><circle cx="15" cy="5.5" r="1.2" /><circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" /><circle cx="9" cy="18.5" r="1.2" /><circle cx="15" cy="18.5" r="1.2" /></>);
export const HardDrive = makeIcon(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 12h.01M10 12h.01" /></>);
export const Heart = makeIcon(<path d="M12 20.5S4 15.4 4 9.8C4 7 6.1 5 8.7 5c1.4 0 2.6.7 3.3 1.8C12.7 5.7 13.9 5 15.3 5 17.9 5 20 7 20 9.8c0 5.6-8 10.7-8 10.7z" />);
export const ImageIcon = makeIcon(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="M21 16l-5-5L5 20" /></>);
export const Info = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></>);
export const Layout = makeIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12" /></>);
export const LayoutGrid = makeIcon(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const ListMusic = makeIcon(<><path d="M3 6h10M3 12h6M3 18h6" /><circle cx="18" cy="17" r="3" /><path d="M20.5 17V6l-3 1" /></>);
export const Lock = makeIcon(<><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /><path d="M12 14v2" /></>);
export const LogOut = makeIcon(<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>);
export const Maximize2 = makeIcon(<><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></>);
export const Mic2 = makeIcon(<><rect x="9" y="3" width="6" height="11" rx="2.5" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>);
export const Minimize2 = makeIcon(<><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></>);
export const Minus = makeIcon(<path d="M5 12h14" />);
export const Monitor = makeIcon(<><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>);
export const Moon = makeIcon(<path d="M20.5 14.5A8.5 8.5 0 019.5 3.5a8.5 8.5 0 1011 11z" />);
export const Music = makeIcon(<><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>);
export const Music2 = makeIcon(<><circle cx="8" cy="18" r="3" /><path d="M18.4 3a1 1 0 011.2 1.2l-7 14a1 1 0 11-1.9-.8l7-14z" /><circle cx="17" cy="16" r="3" /></>);
export const Palette = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 010 18c1.5 0 2-1 1.5-2.5-.5-1.2.2-2.5 2-2.5H19" /><circle cx="7.5" cy="10.5" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16.5" cy="10.5" r="1" /></>);
export const PanelLeft = makeIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></>);
export const PanelLeftClose = makeIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 7v10" /><path d="m16 11-3 3 3 3" /></>);
export const PanelRight = makeIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" /></>);
export const PanelRightClose = makeIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 7v10" /><path d="m8 9 3 3-3 3" /></>);
export const Pause = makeIcon(<><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></>);
export const Play = makeIcon(<path d="M7 4.5v15l12-7.5z" />);
export const Plus = makeIcon(<path d="M12 5v14M5 12h14" />);
export const Power = makeIcon(<><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 11-12.8 0" /></>);
export const Radio = makeIcon(<><rect x="2" y="6" width="20" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M5 6 12 2l7 4" /><path d="M8.5 13v.5M15.5 13v.5" /></>);
export const RefreshCw = makeIcon(<><path d="M21 12a9 9 0 11-2.6-6.3L21 8" /><path d="M21 3v5h-5" /></>);
export const Repeat = makeIcon(<><path d="M17 2l4 4-4 4M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 01-4 4H3" /></>);
export const Repeat1 = makeIcon(<><path d="M17 2l4 4-4 4M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 01-4 4H3" /><path d="M11 15v-4l1.5-1.2" /></>);
export const RotateCcw = makeIcon(<><path d="M3 12a9 9 0 101.6-5L3 9" /><path d="M3 4v5h5" /></>);
export const Search = makeIcon(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>);
export const Settings2 = makeIcon(<><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2.2M12 15.3v2.2M2.5 12h2.2M15.3 12h2.2M5 5l1.6 1.6M17.4 17.4L19 19M19 5l-1.6 1.6M6.6 17.4 5 19" /></>);
export const ShieldCheck = makeIcon(<><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>);
export const Shuffle = makeIcon(<><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6M4 4l5 5" /></>);
export const SkipBack = makeIcon(<><path d="M19 20 9 12l10-8v16z" /><path d="M6 4h2v16H6z" /></>);
export const SkipForward = makeIcon(<><path d="M5 20l10-8L5 4v16z" /><path d="M16 4h2v16h-2z" /></>);
export const Sliders = makeIcon(<><path d="M4 6h4M12 6h8M4 12h10M18 12h2M4 18h6M14 18h6" /><circle cx="10" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="12" cy="18" r="2" /></>);
export const Sparkles = makeIcon(<><path d="M12 3l1.8 4.6 4.6 1.8-4.6 1.8L12 16l-1.8-4.8-4.6-1.8 4.6-1.8z" /><path d="M19 13l.8 2.2 2.2.8-2.2.8L19 19l-.8-2.2L16 16l2.2-.8z" /></>);
export const Square = makeIcon(<rect x="4" y="4" width="16" height="16" rx="2" />);
export const Sun = makeIcon(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const Trash2 = makeIcon(<><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" /><path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" /><path d="M10 11v6M14 11v6" /></>);
export const Upload = makeIcon(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></>);
export const User = makeIcon(<><circle cx="12" cy="8" r="4" /><path d="M4 21c.9-3.5 3.9-5 8-5s7.1 1.5 8 5" /></>);
export const Volume2 = makeIcon(<><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7" /><path d="M18.5 5.5a9 9 0 010 13" /></>);
export const VolumeX = makeIcon(<><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15 9l5 6M20 9l-5 6" /></>);
export const Waves = makeIcon(<><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" /><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" /><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" /></>);
export const X = makeIcon(<path d="M5 5l14 14M19 5 5 19" />);
export const Zap = makeIcon(<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />);