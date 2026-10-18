"use client";

import Script from "next/script";

type TurnstileWidgetProps = {
  className?: string;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact" | "flexible";
};

/**
 * Widget de Cloudflare Turnstile.
 * Si NEXT_PUBLIC_TURNSTILE_SITE_KEY no está definida (en local/tests),
 * no renderiza nada para no bloquear al usuario ni a los tests E2E.
 */
export function TurnstileWidget({ className, theme = "auto", size = "normal" }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return null;
  }

  return (
    <div className={className ?? "my-2"}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-theme={theme}
        data-size={size}
      />
    </div>
  );
}
