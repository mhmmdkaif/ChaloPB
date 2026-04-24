export default function UserBg() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 0,
      background: "linear-gradient(155deg,#1a5f94 0%,#1460a8 45%,#0d4585 100%)",
      overflow: "hidden", pointerEvents: "none",
    }}>

      {/* ── rotated grid (~3deg) for organic feel ── */}
      <div style={{
        position: "absolute",
        inset: "-10%",
        width: "120%", height: "120%",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px)," +
          "linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)",
        backgroundSize: "58px 58px",
        transform: "rotate(3deg)",
      }} />

      {/* ── decorative blobs ── */}
      <div style={{ position:"absolute", width:420, height:420, borderRadius:"50%", background:"rgba(255,255,255,0.03)", top:-110, right:-90 }} />
      <div style={{ position:"absolute", width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.02)", bottom:-60, left:-50 }} />
      <div style={{ position:"absolute", width:160, height:160, borderRadius:"50%", background:"rgba(255,255,255,0.018)", top:"38%", left:"42%" }} />

      {/* ── scattered town lights ── */}
      {[
        [8,12],[15,55],[22,80],[28,18],[35,70],[42,35],[48,90],[55,8],
        [62,62],[68,28],[74,78],[80,15],[85,50],[90,88],[96,32],[5,45],
        [18,38],[32,92],[44,22],[58,74],[72,42],[88,68],[94,12],[12,72],
        [50,50],[38,55],[64,18],[76,84],[92,58],[20,28],
      ].map(([x, y], i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${x}%`, top: `${y}%`,
          width: i % 4 === 0 ? 3 : i % 3 === 0 ? 2.5 : 2,
          height: i % 4 === 0 ? 3 : i % 3 === 0 ? 2.5 : 2,
          borderRadius: "50%",
          background: i % 5 === 0
            ? "rgba(253,230,138,0.35)"
            : i % 4 === 0
              ? "rgba(167,243,208,0.3)"
              : "rgba(255,255,255,0.22)",
        }} />
      ))}

      <style>{`
        @keyframes cpb-move    { 0%{offset-distance:0%} 100%{offset-distance:100%} }
        @keyframes cpb-ease    {
          0%   { offset-distance:0%;   animation-timing-function: cubic-bezier(0.4,0,0.6,1); }
          18%  { offset-distance:18%;  animation-timing-function: cubic-bezier(0,0,0.2,1); }
          22%  { offset-distance:20%;  animation-timing-function: cubic-bezier(0.4,0,1,1); }
          48%  { offset-distance:48%;  animation-timing-function: cubic-bezier(0,0,0.2,1); }
          52%  { offset-distance:50%;  animation-timing-function: cubic-bezier(0.4,0,1,1); }
          78%  { offset-distance:78%;  animation-timing-function: cubic-bezier(0,0,0.2,1); }
          82%  { offset-distance:80%;  animation-timing-function: cubic-bezier(0.4,0,1,1); }
          100% { offset-distance:100%; }
        }
        @keyframes cpb-pulse {
          0%,100% { r: 13; opacity: 0.18; }
          50%     { r: 18; opacity: 0.08; }
        }
        @keyframes cpb-pulse2 {
          0%,100% { r: 13; opacity: 0.18; }
          50%     { r: 18; opacity: 0.08; }
        }
        @keyframes cpb-shimmer {
          0%   { stroke-dashoffset: 2000; opacity: 0; }
          5%   { opacity: 0.25; }
          95%  { opacity: 0.15; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes cpb-fadein {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* GT Road bus 1 — eases at stops */
        .cpb-bA {
          offset-path: path('M -40 378 C 80 348 180 328 300 315 C 420 302 530 298 660 292 C 790 286 890 284 1020 280 C 1140 276 1260 274 1480 270');
          animation: cpb-ease 11s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        /* GT Road bus 2 — chasing, big delay */
        .cpb-bA2 {
          offset-path: path('M -40 378 C 80 348 180 328 300 315 C 420 302 530 298 660 292 C 790 286 890 284 1020 280 C 1140 276 1260 274 1480 270');
          animation: cpb-ease 11s cubic-bezier(0.4,0,0.6,1) infinite -5.5s;
        }
        /* Vertical spur — smaller bus for depth */
        .cpb-bB {
          offset-path: path('M 840 -40 C 820 100 800 210 780 330 C 760 450 742 540 720 660 C 700 770 685 840 665 940');
          animation: cpb-ease 12s cubic-bezier(0.4,0,0.6,1) infinite -6.3s;
        }
        /* Diagonal */
        .cpb-bC {
          offset-path: path('M -40 80 C 120 155 240 215 390 285 C 540 355 660 400 810 460 C 940 512 1060 558 1200 618 C 1310 666 1480 720');
          animation: cpb-ease 14s cubic-bezier(0.4,0,0.6,1) infinite -2.8s;
        }
        /* Lower horizontal reverse */
        .cpb-bD {
          offset-path: path('M 1480 660 C 1300 672 1170 680 1040 685 C 900 690 770 692 630 690 C 490 688 370 682 240 670 C 140 660 60 648 -40 630');
          animation: cpb-ease 13s cubic-bezier(0.4,0,0.6,1) infinite -8s;
        }

        /* shimmer on road 1 */
        .cpb-shimmer1 {
          stroke-dasharray: 120 2000;
          animation: cpb-shimmer 6s linear infinite;
        }
        .cpb-shimmer2 {
          stroke-dasharray: 90 2000;
          animation: cpb-shimmer 8s linear infinite -3s;
        }

        /* sequential city label fade-ins */
        .cpb-label { opacity: 0; animation: cpb-fadein 0.6s ease forwards; }
        .cpb-label-1 { animation-delay: 0.3s; }
        .cpb-label-2 { animation-delay: 0.8s; }
        .cpb-label-3 { animation-delay: 1.3s; }
        .cpb-label-4 { animation-delay: 1.7s; }
        .cpb-label-5 { animation-delay: 2.1s; }
        .cpb-label-6 { animation-delay: 2.5s; }
        .cpb-label-7 { animation-delay: 2.9s; }
        .cpb-label-8 { animation-delay: 3.2s; }
        .cpb-label-9 { animation-delay: 3.5s; }
      `}</style>

      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}
      >

        {/* ══════════════════════════════════════
            GHOST ROAD — mid-section atmospheric
        ══════════════════════════════════════ */}
        <path d="M -40 508 C 100 498 220 492 380 488 C 520 484 650 484 790 486 C 920 488 1040 492 1180 496 C 1300 499 1390 502 1480 505"
          stroke="rgba(255,255,255,0.032)" strokeWidth="8" strokeLinecap="round"/>
        <path d="M -40 508 C 100 498 220 492 380 488 C 520 484 650 484 790 486 C 920 488 1040 492 1180 496 C 1300 499 1390 502 1480 505"
          stroke="rgba(125,211,252,0.10)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="18 14"/>

        {/* ══════════════════════════════════════
            ROAD 1 — main horizontal, bows upward
        ══════════════════════════════════════ */}
        <path d="M -40 378 C 80 348 180 328 300 315 C 420 302 530 298 660 292 C 790 286 890 284 1020 280 C 1140 276 1260 274 1480 270"
          stroke="rgba(255,255,255,0.09)" strokeWidth="14" strokeLinecap="round"/>
        <path d="M -40 383 C 80 353 180 333 300 320 C 420 307 530 303 660 297 C 790 291 890 289 1020 285 C 1140 281 1260 279 1480 275"
          stroke="rgba(255,255,255,0.04)" strokeWidth="6" strokeLinecap="round"/>
        <path d="M -40 378 C 80 348 180 328 300 315 C 420 302 530 298 660 292 C 790 286 890 284 1020 280 C 1140 276 1260 274 1480 270"
          stroke="rgba(125,211,252,0.50)" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 10"/>
        {/* shimmer */}
        <path className="cpb-shimmer1"
          d="M -40 378 C 80 348 180 328 300 315 C 420 302 530 298 660 292 C 790 286 890 284 1020 280 C 1140 276 1260 274 1480 270"
          stroke="rgba(255,255,255,0.55)" strokeWidth="4" strokeLinecap="round"/>

        {/* ══════════════════════════════════════
            ROAD 2 — lower horizontal, bows downward
        ══════════════════════════════════════ */}
        <path d="M -40 630 C 60 648 140 660 240 670 C 370 682 490 688 630 690 C 770 692 900 690 1040 685 C 1170 680 1300 672 1480 660"
          stroke="rgba(255,255,255,0.085)" strokeWidth="14" strokeLinecap="round"/>
        <path d="M -40 635 C 60 653 140 665 240 675 C 370 687 490 693 630 695 C 770 697 900 695 1040 690 C 1170 685 1300 677 1480 665"
          stroke="rgba(255,255,255,0.04)" strokeWidth="6" strokeLinecap="round"/>
        <path d="M -40 630 C 60 648 140 660 240 670 C 370 682 490 688 630 690 C 770 692 900 690 1040 685 C 1170 680 1300 672 1480 660"
          stroke="rgba(216,180,254,0.42)" strokeWidth="2.8" strokeLinecap="round" strokeDasharray="14 11"/>
        <path className="cpb-shimmer2"
          d="M -40 630 C 60 648 140 660 240 670 C 370 682 490 688 630 690 C 770 692 900 690 1040 685 C 1170 680 1300 672 1480 660"
          stroke="rgba(216,180,254,0.6)" strokeWidth="3.5" strokeLinecap="round"/>

        {/* ══════════════════════════════════════
            ROAD 3 — vertical spur
        ══════════════════════════════════════ */}
        <path d="M 840 -40 C 820 100 800 210 780 330 C 760 450 742 540 720 660 C 700 770 685 840 665 940"
          stroke="rgba(255,255,255,0.08)" strokeWidth="12" strokeLinecap="round"/>
        <path d="M 846 -40 C 826 100 806 210 786 330 C 766 450 748 540 726 660 C 706 770 691 840 671 940"
          stroke="rgba(255,255,255,0.038)" strokeWidth="5" strokeLinecap="round"/>
        <path d="M 840 -40 C 820 100 800 210 780 330 C 760 450 742 540 720 660 C 700 770 685 840 665 940"
          stroke="rgba(167,243,208,0.44)" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="13 10"/>

        {/* ══════════════════════════════════════
            ROAD 4 — diagonal
        ══════════════════════════════════════ */}
       <path d="M -40 80 C 120 155 240 215 390 285 C 540 355 660 400 810 460 C 940 512 1060 558 1200 618 C 1310 666 1480 720 2000 900"
  stroke="rgba(255,255,255,0.068)" strokeWidth="12" strokeLinecap="round"/>

<path d="M -36 86 C 124 161 244 221 394 291 C 544 361 664 406 814 466 C 944 518 1064 564 1204 624 C 1314 672 1484 726 2004 906"
  stroke="rgba(255,255,255,0.034)" strokeWidth="5" strokeLinecap="round"/>

<path d="M -40 80 C 120 155 240 215 390 285 C 540 355 660 400 810 460 C 940 512 1060 558 1200 618 C 1310 666 1480 720 2000 900"
  stroke="rgba(253,230,138,0.36)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="12 13"/>
        {/* ══════════════════════════════════════
            INTERSECTION DOTS
        ══════════════════════════════════════ */}
        <circle cx="390" cy="285" r="7"  fill="rgba(255,255,255,0.88)"/>
        <circle cx="390" cy="285" r="13" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"/>
        <circle cx="660" cy="292" r="7"  fill="rgba(255,255,255,0.85)"/>
        <circle cx="660" cy="292" r="13" fill="none" stroke="rgba(125,211,252,0.22)" strokeWidth="1.5"/>
        <circle cx="810" cy="460" r="6.5" fill="rgba(255,255,255,0.80)"/>
        <circle cx="810" cy="460" r="12"  fill="none" stroke="rgba(253,230,138,0.2)" strokeWidth="1.5"/>
        <circle cx="720" cy="680" r="6.5" fill="rgba(255,255,255,0.78)"/>
        <circle cx="720" cy="680" r="12"  fill="none" stroke="rgba(216,180,254,0.22)" strokeWidth="1.5"/>

        {/* ══════════════════════════════════════
            CITY STOPS — pulsing outer rings
        ══════════════════════════════════════ */}

        {/* Ludhiana */}
        <circle cx="300" cy="315" r="10" fill="rgba(255,255,255,0.90)"/>
        <circle cx="300" cy="315" r="16" fill="rgba(125,211,252,0.10)"/>
        <circle cx="300" cy="315" r="22" fill="rgba(125,211,252,0.06)"/>
        <circle cx="300" cy="315" style={{animation:"cpb-pulse 3s ease-in-out infinite"}} fill="none" stroke="rgba(125,211,252,0.22)" strokeWidth="1.5"/>
        <g className="cpb-label cpb-label-1">
          <text x="300" y="291" fontFamily="DM Sans,sans-serif" fontSize="13" fill="rgba(255,255,255,0.92)" textAnchor="middle" fontWeight="600">Ludhiana</text>
        </g>

        {/* Jalandhar */}
        <circle cx="660" cy="292" r="10" fill="rgba(255,255,255,0.90)"/>
        <circle cx="660" cy="292" r="16" fill="rgba(125,211,252,0.10)"/>
        <circle cx="660" cy="292" r="22" fill="rgba(125,211,252,0.06)"/>
        <circle cx="660" cy="292" style={{animation:"cpb-pulse 3s ease-in-out infinite 0.5s"}} fill="none" stroke="rgba(125,211,252,0.22)" strokeWidth="1.5"/>
        <g className="cpb-label cpb-label-2">
          <text x="660" y="268" fontFamily="DM Sans,sans-serif" fontSize="13" fill="rgba(255,255,255,0.92)" textAnchor="middle" fontWeight="600">Jalandhar</text>
        </g>

        {/* Amritsar */}
        <circle cx="1020" cy="280" r="10" fill="#7dd3fc" opacity="0.95"/>
        <circle cx="1020" cy="280" r="16" fill="rgba(125,211,252,0.14)"/>
        <circle cx="1020" cy="280" r="22" fill="rgba(125,211,252,0.08)"/>
        <circle cx="1020" cy="280" style={{animation:"cpb-pulse 3s ease-in-out infinite 1s"}} fill="none" stroke="rgba(125,211,252,0.28)" strokeWidth="1.5"/>
        <g className="cpb-label cpb-label-3">
          <text x="1020" y="256" fontFamily="DM Sans,sans-serif" fontSize="13" fill="rgba(255,255,255,0.93)" textAnchor="middle" fontWeight="600">Amritsar</text>
        </g>

        {/* Phagwara */}
        <circle cx="480" cy="295" r="6.5" fill="rgba(255,255,255,0.72)"/>
        <g className="cpb-label cpb-label-4">
          <text x="480" y="278" fontFamily="DM Sans,sans-serif" fontSize="11" fill="rgba(255,255,255,0.62)" textAnchor="middle">Phagwara</text>
        </g>

        {/* Pathankot */}
        <circle cx="800" cy="168" r="7.5" fill="rgba(167,243,208,0.82)"/>
        <circle cx="800" cy="168" r="14"  fill="none" stroke="rgba(167,243,208,0.18)" strokeWidth="1.5"/>
        <g className="cpb-label cpb-label-5">
          <text x="822" y="172" fontFamily="DM Sans,sans-serif" fontSize="12" fill="rgba(167,243,208,0.80)" fontWeight="500">Pathankot</text>
        </g>

        {/* Batala */}
        <circle cx="820" cy="55"  r="6"   fill="rgba(167,243,208,0.65)"/>
        <g className="cpb-label cpb-label-6">
          <text x="840" y="58" fontFamily="DM Sans,sans-serif" fontSize="11" fill="rgba(167,243,208,0.62)">Batala</text>
        </g>

        {/* Patiala */}
        <circle cx="630" cy="688" r="7.5" fill="rgba(253,230,138,0.82)"/>
        <circle cx="630" cy="688" r="14"  fill="none" stroke="rgba(253,230,138,0.18)" strokeWidth="1.5"/>
        <g className="cpb-label cpb-label-7">
          <text x="630" y="708" fontFamily="DM Sans,sans-serif" fontSize="12" fill="rgba(253,230,138,0.78)" textAnchor="middle">Patiala</text>
        </g>

        {/* Chandigarh */}
        <circle cx="1040" cy="684" r="8"  fill="#c4b5fd" opacity="0.88"/>
        <circle cx="1040" cy="684" r="16" fill="none" stroke="rgba(196,181,253,0.18)" strokeWidth="1.5"/>
        <g className="cpb-label cpb-label-8">
          <text x="1040" y="704" fontFamily="DM Sans,sans-serif" fontSize="12" fill="rgba(196,181,253,0.82)" textAnchor="middle" fontWeight="500">Chandigarh</text>
        </g>

        {/* Bathinda */}
        <circle cx="80" cy="345" r="7"   fill="rgba(216,180,254,0.72)"/>
        <g className="cpb-label cpb-label-9">
          <text x="80" y="326" fontFamily="DM Sans,sans-serif" fontSize="11" fill="rgba(216,180,254,0.68)" textAnchor="middle">Bathinda</text>
        </g>

        {/* Moga — no animation, too small */}
        <circle cx="175" cy="660" r="5.5" fill="rgba(216,180,254,0.58)"/>
        <text x="175" y="642" fontFamily="DM Sans,sans-serif" fontSize="10" fill="rgba(216,180,254,0.50)" textAnchor="middle">Moga</text>
        <text x="530" y="240" fontFamily="DM Sans,sans-serif" fontSize="10" fill="rgba(167,243,208,0.40)">Hoshiarpur</text>

        {/* ══════════════════════════════════════
            BUSES
        ══════════════════════════════════════ */}

        {/* Bus A1 — GT Road, full size */}
        <g className="cpb-bA">
          <rect x="-13" y="-8" width="26" height="16" rx="3.5" fill="#1460a3" stroke="#7dd3fc" strokeWidth="1.5"/>
          <rect x="-8"   y="-5" width="4.5" height="5" rx="1" fill="rgba(125,211,252,0.72)"/>
          <rect x="-1.5" y="-5" width="4.5" height="5" rx="1" fill="rgba(125,211,252,0.72)"/>
          <rect x="5"    y="-5" width="3.5" height="5" rx="1" fill="rgba(125,211,252,0.72)"/>
          <circle cx="-6" cy="7.5" r="2.8" fill="#0d3a75" stroke="#7dd3fc" strokeWidth="1"/>
          <circle cx="6"  cy="7.5" r="2.8" fill="#0d3a75" stroke="#7dd3fc" strokeWidth="1"/>
          <circle cx="12" cy="0"   r="1.8" fill="#fde68a"/>
        </g>

        {/* Bus A2 — GT Road chaser, slightly different shade */}
        <g className="cpb-bA2">
          <rect x="-13" y="-8" width="26" height="16" rx="3.5" fill="#0e4a8a" stroke="#93c5fd" strokeWidth="1.5"/>
          <rect x="-8"   y="-5" width="4.5" height="5" rx="1" fill="rgba(147,197,253,0.70)"/>
          <rect x="-1.5" y="-5" width="4.5" height="5" rx="1" fill="rgba(147,197,253,0.70)"/>
          <rect x="5"    y="-5" width="3.5" height="5" rx="1" fill="rgba(147,197,253,0.70)"/>
          <circle cx="-6" cy="7.5" r="2.8" fill="#082d5a" stroke="#93c5fd" strokeWidth="1"/>
          <circle cx="6"  cy="7.5" r="2.8" fill="#082d5a" stroke="#93c5fd" strokeWidth="1"/>
          <circle cx="12" cy="0"   r="1.8" fill="#fde68a"/>
        </g>

        {/* Bus B — vertical spur, SMALLER for depth perspective */}
        <g className="cpb-bB">
          <rect x="-8" y="-5.5" width="16" height="11" rx="2.5" fill="#166534" stroke="#a7f3d0" strokeWidth="1.1"/>
          <rect x="-5" y="-3"   width="3"   height="3.5" rx="0.8" fill="rgba(167,243,208,0.65)"/>
          <rect x="-0.5" y="-3" width="3"   height="3.5" rx="0.8" fill="rgba(167,243,208,0.65)"/>
          <circle cx="-4" cy="5" r="2"   fill="#14532d" stroke="#a7f3d0" strokeWidth="0.8"/>
          <circle cx="4"  cy="5" r="2"   fill="#14532d" stroke="#a7f3d0" strokeWidth="0.8"/>
        </g>

        {/* Bus C — diagonal, amber */}
        <g className="cpb-bC">
          <rect x="-13" y="-8" width="26" height="16" rx="3.5" fill="#713f12" stroke="#fde68a" strokeWidth="1.4"/>
          <rect x="-8"   y="-5" width="4.5" height="5" rx="1" fill="rgba(253,230,138,0.68)"/>
          <rect x="-1.5" y="-5" width="4.5" height="5" rx="1" fill="rgba(253,230,138,0.68)"/>
          <rect x="5"    y="-5" width="3.5" height="5" rx="1" fill="rgba(253,230,138,0.68)"/>
          <circle cx="-6" cy="7.5" r="2.8" fill="#5c3308" stroke="#fde68a" strokeWidth="1"/>
          <circle cx="6"  cy="7.5" r="2.8" fill="#5c3308" stroke="#fde68a" strokeWidth="1"/>
          <circle cx="12" cy="0"   r="1.8" fill="#7dd3fc"/>
        </g>

        {/* Bus D — lower horizontal reverse, purple */}
        <g className="cpb-bD">
          <rect x="-13" y="-8" width="26" height="16" rx="3.5" fill="#4a1d96" stroke="#c4b5fd" strokeWidth="1.4"/>
          <rect x="-8"   y="-5" width="4.5" height="5" rx="1" fill="rgba(196,181,253,0.68)"/>
          <rect x="-1.5" y="-5" width="4.5" height="5" rx="1" fill="rgba(196,181,253,0.68)"/>
          <rect x="5"    y="-5" width="3.5" height="5" rx="1" fill="rgba(196,181,253,0.68)"/>
          <circle cx="-6" cy="7.5" r="2.8" fill="#3b0764" stroke="#c4b5fd" strokeWidth="1"/>
          <circle cx="6"  cy="7.5" r="2.8" fill="#3b0764" stroke="#c4b5fd" strokeWidth="1"/>
        </g>

      </svg>
    </div>
  );
}