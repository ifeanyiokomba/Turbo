"use client";

import * as React from "react";
import { useApp, type AppUser } from "../store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Globe, ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface CountryInfo {
  code: string;
  name: string;
  currency: string;
  flagEmoji: string;
  paymentMethods: string[];
  enabled: boolean;
}

export function CountrySwitcher() {
  const { user, setUser } = useApp();
  const [countries, setCountries] = React.useState<CountryInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [switching, setSwitching] = React.useState(false);

  const loadCountries = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/geo/countries", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setCountries(json.countries ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCountries();
  }, [loadCountries]);

  async function switchCountry(code: string) {
    if (!user || user.country === code) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/geo/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: code }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Could not switch country");
        return;
      }
      // Update the in-memory user with the new country + new fields
      const updated: AppUser = {
        ...(user as AppUser),
        ...json.user,
      };
      setUser(updated);
      toast.success(`Switched to ${json.countryConfig?.name ?? code}`);
      // Reload the dashboard so all views re-fetch with the new georouting context
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.reload();
      }, 600);
    } finally {
      setSwitching(false);
    }
  }

  const current = countries.find((c) => c.code === user?.country);
  const flag = current?.flagEmoji ?? "🌍";
  const name = current?.name ?? user?.country ?? "Select";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={switching || loading}
          aria-label="Switch country"
        >
          <span className="text-base leading-none">{flag}</span>
          <span className="hidden text-xs font-medium sm:inline">{name}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs">
          <Globe className="h-3.5 w-3.5" /> Select your country
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {countries.map((c) => {
          const isActive = c.code === user?.country;
          return (
            <DropdownMenuItem
              key={c.code}
              onClick={() => switchCountry(c.code)}
              className="flex items-center gap-2 py-2"
            >
              <span className="text-base leading-none">{c.flagEmoji}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.currency} · {c.paymentMethods.length} methods
                </p>
              </div>
              {isActive && <Check className="h-4 w-4 text-emerald-600" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
