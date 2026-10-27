export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " compact" : ""}`}>
      <svg className="brand-mark" viewBox="0 0 54 50" role="img" aria-label="Puesto de mercado">
        <defs>
          <clipPath id="awning-shape">
            <path d="M3 17V10.5C3 6.4 6.4 3 10.5 3h33C47.6 3 51 6.4 51 10.5V17c0 1.1-.9 2-2 2h-1.6c-1.7 0-3.1 1.4-3.1 3.1 0 1.7-1.4 3.1-3.1 3.1-1.7 0-3.1-1.4-3.1-3.1 0-1.7-1.4-3.1-3.1-3.1-1.7 0-3.1 1.4-3.1 3.1 0 1.7-1.4 3.1-3.1 3.1-1.7 0-3.1-1.4-3.1-3.1 0-1.7-1.4-3.1-3.1-3.1-1.7 0-3.1 1.4-3.1 3.1 0 1.7-1.4 3.1-3.1 3.1-1.7 0-3.1-1.4-3.1-3.1 0-1.7-1.4-3.1-3.1-3.1-1.7 0-3.1 1.4-3.1 3.1 0 1.7-1.4 3.1-3.1 3.1H5c-1.1 0-2-.9-2-2Z" />
          </clipPath>
        </defs>
        <rect x="7" y="24" width="40" height="22" rx="3.5" fill="#fffdf9" stroke="#d9b8b5" strokeWidth="1.3" />
        <rect x="11" y="29" width="10" height="8" rx="1.4" fill="#f5e5df" />
        <rect x="23" y="29" width="9" height="8" rx="1.4" fill="#e47f9c" />
        <rect x="34" y="29" width="8" height="8" rx="1.4" fill="#f1c76f" />
        <path d="M11 41h32" stroke="#d9b8b5" strokeWidth="1.3" strokeLinecap="round" />
        <rect x="7" y="22.5" width="40" height="3" rx="1" fill="#dbb9b5" />
        <g clipPath="url(#awning-shape)">
          <rect x="2" y="2" width="52" height="23" fill="#fffdf9" />
          <path d="M3 0h8v25H3zM19 0h8v25h-8zM35 0h8v25h-8zM51 0h8v25h-8z" fill="#e47f9c" />
          <path d="M3 0h48v3H3z" fill="#f3b8c7" opacity=".8" />
        </g>
        <path d="M9 23v19M45 23v19" stroke="#c96b87" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="48" cy="8" r="3.8" fill="#f1c76f" stroke="#fffdf9" strokeWidth="1.6" />
      </svg>
      <span className="brand-copy">
        <strong>
          CON<span>ectors</span>
        </strong>
        {!compact && <small>Tool</small>}
      </span>
    </div>
  );
}
