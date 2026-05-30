interface AvatarDecorationProps {
  decoration: string;
  size?: number;
}

export default function AvatarDecoration({ decoration, size = 112 }: AvatarDecorationProps) {
  const scale = size / 112;

  if (decoration === 'headphones') {
    const radius = size / 2;
    const cupSize = size * 0.15; // Размер чашки
    const cupDistance = radius * 0.9; // Расстояние от центра до чашки

    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 pointer-events-none"
      >
        {/* Left headphone cup */}
        <g>
          {/* Outer glow */}
          <circle
            cx={radius - cupDistance}
            cy={radius}
            r={cupSize * 1.4}
            fill="#6366f1"
            opacity="0.2"
            filter="url(#glow)"
          >
            <animate attributeName="opacity" values="0.2;0.35;0.2" dur="1.5s" repeatCount="indefinite" />
          </circle>

          {/* Main cup */}
          <circle
            cx={radius - cupDistance}
            cy={radius}
            r={cupSize}
            fill="#1e293b"
            stroke="#6366f1"
            strokeWidth="3"
          >
            <animate attributeName="r" values={`${cupSize};${cupSize * 0.97};${cupSize}`} dur="0.15s" repeatCount="indefinite" />
          </circle>

          {/* Inner speaker ring */}
          <circle
            cx={radius - cupDistance}
            cy={radius}
            r={cupSize * 0.7}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            opacity="0.5"
          />

          {/* Center dot */}
          <circle
            cx={radius - cupDistance}
            cy={radius}
            r={cupSize * 0.3}
            fill="#8b5cf6"
            opacity="0.7"
          >
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* Right headphone cup */}
        <g>
          {/* Outer glow */}
          <circle
            cx={radius + cupDistance}
            cy={radius}
            r={cupSize * 1.4}
            fill="#6366f1"
            opacity="0.2"
            filter="url(#glow)"
          >
            <animate attributeName="opacity" values="0.2;0.35;0.2" dur="1.5s" repeatCount="indefinite" begin="0.75s" />
          </circle>

          {/* Main cup */}
          <circle
            cx={radius + cupDistance}
            cy={radius}
            r={cupSize}
            fill="#1e293b"
            stroke="#6366f1"
            strokeWidth="3"
          >
            <animate attributeName="r" values={`${cupSize};${cupSize * 0.97};${cupSize}`} dur="0.15s" repeatCount="indefinite" />
          </circle>

          {/* Inner speaker ring */}
          <circle
            cx={radius + cupDistance}
            cy={radius}
            r={cupSize * 0.7}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            opacity="0.5"
          />

          {/* Center dot */}
          <circle
            cx={radius + cupDistance}
            cy={radius}
            r={cupSize * 0.3}
            fill="#8b5cf6"
            opacity="0.7"
          >
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1s" repeatCount="indefinite" begin="0.5s" />
          </circle>
        </g>

        {/* Headband - connecting arc */}
        <path
          d={`M ${radius - cupDistance} ${radius - cupSize * 0.5}
              Q ${radius} ${radius - radius * 0.8},
              ${radius + cupDistance} ${radius - cupSize * 0.5}`}
          stroke="#1e293b"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M ${radius - cupDistance} ${radius - cupSize * 0.5}
              Q ${radius} ${radius - radius * 0.8},
              ${radius + cupDistance} ${radius - cupSize * 0.5}`}
          stroke="url(#headbandGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        >
          <animate
            attributeName="d"
            values={`M ${radius - cupDistance} ${radius - cupSize * 0.5} Q ${radius} ${radius - radius * 0.8}, ${radius + cupDistance} ${radius - cupSize * 0.5};M ${radius - cupDistance} ${radius - cupSize * 0.5} Q ${radius} ${radius - radius * 0.82}, ${radius + cupDistance} ${radius - cupSize * 0.5};M ${radius - cupDistance} ${radius - cupSize * 0.5} Q ${radius} ${radius - radius * 0.8}, ${radius + cupDistance} ${radius - cupSize * 0.5}`}
            dur="0.15s"
            repeatCount="indefinite"
          />
        </path>

        {/* Inner headband padding */}
        <path
          d={`M ${radius - cupDistance * 0.8} ${radius - cupSize * 0.3}
              Q ${radius} ${radius - radius * 0.65},
              ${radius + cupDistance * 0.8} ${radius - cupSize * 0.3}`}
          stroke="#6366f1"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.4"
        />

        <defs>
          <linearGradient id="headbandGradient" x1="0" y1="0" x2={size} y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="0.5" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>
    );
  }

  if (decoration === 'crown') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 112 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 pointer-events-none"
      >
        <path
          d="M20 25L30 40L40 25L50 40L56 25L62 40L72 25L82 40L92 25L85 55H27L20 25Z"
          fill="url(#crownGradient)"
          stroke="#fbbf24"
          strokeWidth="2"
        />
        <circle cx="30" cy="40" r="3" fill="#ef4444" />
        <circle cx="50" cy="40" r="3" fill="#3b82f6" />
        <circle cx="62" cy="40" r="3" fill="#10b981" />
        <circle cx="82" cy="40" r="3" fill="#8b5cf6" />
        <defs>
          <linearGradient id="crownGradient" x1="56" y1="25" x2="56" y2="55" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fbbf24" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (decoration === 'roses') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 112 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 pointer-events-none"
      >
        {/* Left rose */}
        <circle cx="25" cy="30" r="8" fill="#f43f5e" opacity="0.8" />
        <circle cx="25" cy="30" r="5" fill="#fb7185" />
        <circle cx="25" cy="30" r="3" fill="#fda4af" />
        <path d="M25 38C25 38 22 40 20 45" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="22" cy="42" rx="3" ry="2" fill="#22c55e" opacity="0.6" />

        {/* Right rose */}
        <circle cx="87" cy="30" r="8" fill="#f43f5e" opacity="0.8" />
        <circle cx="87" cy="30" r="5" fill="#fb7185" />
        <circle cx="87" cy="30" r="3" fill="#fda4af" />
        <path d="M87 38C87 38 90 40 92 45" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="90" cy="42" rx="3" ry="2" fill="#22c55e" opacity="0.6" />

        {/* Top rose */}
        <circle cx="56" cy="15" r="9" fill="#f43f5e" opacity="0.8" />
        <circle cx="56" cy="15" r="6" fill="#fb7185" />
        <circle cx="56" cy="15" r="4" fill="#fda4af" />
        <path d="M56 24C56 24 54 27 52 32" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="54" cy="28" rx="3" ry="2" fill="#22c55e" opacity="0.6" />
      </svg>
    );
  }

  if (decoration === 'halo') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 112 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 pointer-events-none"
      >
        <ellipse cx="56" cy="15" rx="25" ry="6" fill="url(#haloGradient)" opacity="0.8" />
        <ellipse cx="56" cy="15" rx="25" ry="6" stroke="#fbbf24" strokeWidth="2" opacity="0.6" />
        <ellipse cx="56" cy="15" rx="20" ry="4" fill="#fef3c7" opacity="0.4" />

        {/* Sparkles */}
        <circle cx="35" cy="12" r="2" fill="#fbbf24" opacity="0.8">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="77" cy="12" r="2" fill="#fbbf24" opacity="0.8">
          <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
        </circle>

        <defs>
          <linearGradient id="haloGradient" x1="56" y1="9" x2="56" y2="21" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef3c7" />
            <stop offset="1" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (decoration === 'fire') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 112 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 pointer-events-none"
      >
        {/* Flames around avatar */}
        <path d="M30 20C30 20 25 15 25 25C25 35 30 40 35 40C35 40 32 35 35 30C38 25 40 20 40 20" fill="#f97316" opacity="0.8">
          <animate attributeName="d" values="M30 20C30 20 25 15 25 25C25 35 30 40 35 40C35 40 32 35 35 30C38 25 40 20 40 20;M30 18C30 18 25 13 25 23C25 33 30 38 35 38C35 38 32 33 35 28C38 23 40 18 40 18;M30 20C30 20 25 15 25 25C25 35 30 40 35 40C35 40 32 35 35 30C38 25 40 20 40 20" dur="1.5s" repeatCount="indefinite" />
        </path>
        <path d="M82 20C82 20 87 15 87 25C87 35 82 40 77 40C77 40 80 35 77 30C74 25 72 20 72 20" fill="#f97316" opacity="0.8">
          <animate attributeName="d" values="M82 20C82 20 87 15 87 25C87 35 82 40 77 40C77 40 80 35 77 30C74 25 72 20 72 20;M82 18C82 18 87 13 87 23C87 33 82 38 77 38C77 38 80 33 77 28C74 23 72 18 72 18;M82 20C82 20 87 15 87 25C87 35 82 40 77 40C77 40 80 35 77 30C74 25 72 20 72 20" dur="1.5s" repeatCount="indefinite" />
        </path>

        <path d="M56 8C56 8 52 5 52 12C52 19 56 22 60 22C60 22 58 18 60 15C62 12 64 8 64 8" fill="#fbbf24" opacity="0.9">
          <animate attributeName="d" values="M56 8C56 8 52 5 52 12C52 19 56 22 60 22C60 22 58 18 60 15C62 12 64 8 64 8;M56 6C56 6 52 3 52 10C52 17 56 20 60 20C60 20 58 16 60 13C62 10 64 6 64 6;M56 8C56 8 52 5 52 12C52 19 56 22 60 22C60 22 58 18 60 15C62 12 64 8 64 8" dur="1.5s" repeatCount="indefinite" />
        </path>
      </svg>
    );
  }

  if (decoration === 'sparkles') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 112 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 pointer-events-none"
      >
        {/* Sparkle 1 */}
        <g opacity="0.8">
          <path d="M25 25L27 30L32 32L27 34L25 39L23 34L18 32L23 30Z" fill="#fbbf24">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
          </path>
        </g>

        {/* Sparkle 2 */}
        <g opacity="0.8">
          <path d="M85 28L87 33L92 35L87 37L85 42L83 37L78 35L83 33Z" fill="#8b5cf6">
            <animate attributeName="opacity" values="1;0.3;1" dur="2.5s" repeatCount="indefinite" />
          </path>
        </g>

        {/* Sparkle 3 */}
        <g opacity="0.8">
          <path d="M56 10L58 14L62 16L58 18L56 22L54 18L50 16L54 14Z" fill="#ec4899">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1.8s" repeatCount="indefinite" />
          </path>
        </g>

        {/* Sparkle 4 */}
        <g opacity="0.8">
          <path d="M20 60L21 63L24 64L21 65L20 68L19 65L16 64L19 63Z" fill="#3b82f6">
            <animate attributeName="opacity" values="1;0.4;1" dur="2.2s" repeatCount="indefinite" />
          </path>
        </g>

        {/* Sparkle 5 */}
        <g opacity="0.8">
          <path d="M90 65L91 68L94 69L91 70L90 73L89 70L86 69L89 68Z" fill="#10b981">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="1.9s" repeatCount="indefinite" />
          </path>
        </g>
      </svg>
    );
  }

  if (decoration === 'hearts') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 112 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 pointer-events-none"
      >
        {/* Heart 1 */}
        <path d="M25 30C25 25 20 20 15 25C10 30 15 35 25 40C35 35 40 30 35 25C30 20 25 25 25 30Z" fill="#ec4899" opacity="0.8">
          <animateTransform attributeName="transform" type="scale" values="1;1.1;1" dur="1.5s" repeatCount="indefinite" additive="sum" />
        </path>

        {/* Heart 2 */}
        <path d="M87 30C87 25 82 20 77 25C72 30 77 35 87 40C97 35 102 30 97 25C92 20 87 25 87 30Z" fill="#f472b6" opacity="0.8">
          <animateTransform attributeName="transform" type="scale" values="1.1;1;1.1" dur="1.8s" repeatCount="indefinite" additive="sum" />
        </path>

        {/* Heart 3 */}
        <path d="M56 15C56 11 52 8 48 11C44 14 48 18 56 22C64 18 68 14 64 11C60 8 56 11 56 15Z" fill="#fb7185" opacity="0.9">
          <animateTransform attributeName="transform" type="scale" values="1;1.15;1" dur="2s" repeatCount="indefinite" additive="sum" />
        </path>
      </svg>
    );
  }

  if (decoration === 'stars') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 112 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 pointer-events-none"
      >
        {/* Star 1 */}
        <path d="M25 25L27 32L34 34L27 36L25 43L23 36L16 34L23 32Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1">
          <animateTransform attributeName="transform" type="rotate" values="0 25 34;360 25 34" dur="10s" repeatCount="indefinite" />
        </path>

        {/* Star 2 */}
        <path d="M87 28L89 35L96 37L89 39L87 46L85 39L78 37L85 35Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1">
          <animateTransform attributeName="transform" type="rotate" values="360 87 37;0 87 37" dur="12s" repeatCount="indefinite" />
        </path>

        {/* Star 3 */}
        <path d="M56 10L58 16L64 18L58 20L56 26L54 20L48 18L54 16Z" fill="#fef3c7" stroke="#fbbf24" strokeWidth="1">
          <animateTransform attributeName="transform" type="rotate" values="0 56 18;360 56 18" dur="8s" repeatCount="indefinite" />
        </path>
      </svg>
    );
  }

  return null;
}
